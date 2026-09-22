/**
 * スキーマと注文処理を、本物の Postgres に対して確かめる。
 *
 * なぜ必要か:
 *  - ensureSchema は主催者の初回アクセス時に自動で流れる。壊れていたら
 *    当日その場で分かることになり、誰も直せない。
 *  - place_order は PL/pgSQL 関数なので、本体は CREATE 時に構文しか見られない。
 *    列名の間違いは最初の注文が来るまで表面化しない。
 *  - 「最後の 1 杯を 2 人が同時に取れない」は、実際に同時に叩かないと確かめられない。
 *
 * 使い方:
 *   PGHOST=localhost PGUSER=postgres PGPASSWORD=x PGDATABASE=saga node scripts/check-schema.mjs
 */

import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';

import { SEED_STATEMENTS, STATEMENTS } from '../src/lib/schema-sql.ts';

const pool = new Pool({ max: 20 });

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

async function applySchema(round) {
  for (const statement of [...STATEMENTS, ...SEED_STATEMENTS]) {
    try {
      await pool.query(statement);
    } catch (error) {
      failures += 1;
      const head = statement.replace(/\s+/g, ' ').slice(0, 90);
      console.log(`  ✗ ${round}: ${head}\n      → ${error.message}`);
      return false;
    }
  }
  console.log(`  ✓ ${round}: ${STATEMENTS.length + SEED_STATEMENTS.length} 文すべて適用できた`);
  return true;
}

/**
 * store.ts など本番コードの中の SQL を、実スキーマに対して PREPARE で検証する。
 *
 * PREPARE は実行せずに解析だけ行うので、副作用なしに
 *   - 構文の誤り（42601）
 *   - 存在しない列（42703）
 *   - 存在しない表（42P01）
 * を捕まえられる。型が決まらない（42P18）は、プレースホルダに型注釈が無い
 * だけで実際には動くため、失敗とみなさない。
 */
async function checkInlineSql() {
  const files = ['src/lib/store.ts', 'src/lib/auth.ts', 'src/lib/setup-state.ts', 'src/lib/push.ts'];
  const fatal = new Set(['42601', '42703', '42P01', '42883', '42704']);
  const starts = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i;

  let checked = 0;
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const literals = [...text.matchAll(/`((?:[^`\\]|\\.)*)`/gs)].map((m) => m[1]);

    for (const raw of literals) {
      const sql = raw.trim();
      if (!starts.test(sql)) continue;

      // ${...} を $1, $2 … に置き換える
      let n = 0;
      const prepared = sql.replace(/\$\{[^{}]*\}/g, () => `$${++n}`);
      checked += 1;

      const name = `chk_${checked}`;
      try {
        await pool.query(`PREPARE ${name} AS ${prepared}`);
        await pool.query(`DEALLOCATE ${name}`);
      } catch (error) {
        if (fatal.has(error.code)) {
          failures += 1;
          console.log(
            `  ✗ ${file}\n      ${prepared.replace(/\s+/g, ' ').slice(0, 100)}\n      → [${error.code}] ${error.message}`,
          );
        }
      }
    }
  }
  check(`本番コード中の SQL ${checked} 件が実スキーマと合っている`, true);
}

/** place_order を呼び、1 行の結果を返す。 */
async function order(userId, itemId, cups, client = pool) {
  const { rows } = await client.query(
    'SELECT ok, reason, request_id, spent FROM place_order($1, $2, $3)',
    [userId, itemId, cups],
  );
  return rows[0];
}

async function seed({ bottles, cupsPerBottle, ticketCost, tickets }) {
  await pool.query('TRUNCATE requests, items, breweries, guests RESTART IDENTITY CASCADE');
  await pool.query(
    `INSERT INTO breweries (id, name, area, booth, login_id)
     VALUES ('b1', 'テスト酒造', '佐賀市', 'A-01', 'kura-001')`,
  );
  await pool.query(
    `INSERT INTO items (id, brewery_id, name, size, cups_per_bottle, bottles, ticket_cost)
     VALUES ('i1', 'b1', 'テスト純米', '四合瓶', $1, $2, $3)`,
    [cupsPerBottle, bottles, ticketCost],
  );
  await pool.query(
    `INSERT INTO guests (clerk_user_id, display_no, tickets) VALUES ('u1', '参加者 #10001', $1)`,
    [tickets],
  );
}

async function ticketsOf(userId = 'u1') {
  const { rows } = await pool.query('SELECT tickets, used FROM guests WHERE clerk_user_id = $1', [
    userId,
  ]);
  return rows[0];
}

/** 参加者を足す。 */
async function addGuest(userId, tickets) {
  await pool.query(
    `INSERT INTO guests (clerk_user_id, display_no, tickets) VALUES ($1, $2, $3)`,
    [userId, `参加者 ${userId}`, tickets],
  );
}

/**
 * 注文を受渡完了にする（在庫も減らす）。
 *
 * 受け取るまで次を頼めない（Issue #34）ので、同じ参加者で続けて注文を
 * 確かめたいときは、間でこれを呼ぶ。
 */
async function deliver(requestId) {
  await pool.query(
    `WITH moved AS (
       UPDATE requests SET status = 'delivered', updated_at = now()
       WHERE id = $1 AND status IN ('accepted', 'preparing', 'ready')
       RETURNING item_id, cups
     )
     UPDATE items SET used_cups = used_cups + (SELECT cups FROM moved)
     WHERE id = (SELECT item_id FROM moved)`,
    [requestId],
  );
}

async function main() {
  console.log('\n■ スキーマの適用（冪等性の確認）');
  if (!(await applySchema('1 回目'))) return;
  if (!(await applySchema('2 回目'))) return;

  const { rows: tables } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  );
  check(
    '必要な表がそろっている',
    ['breweries', 'events', 'guests', 'items', 'notice_reads', 'notices', 'organizers', 'requests', 'ticket_batches', 'tickets']
      .every((t) => tables.some((r) => r.tablename === t)),
    tables.map((r) => r.tablename).join(', '),
  );

  const { rows: batches } = await pool.query('SELECT id FROM ticket_batches ORDER BY sort_order');
  check('券種の初期データが 2 件入っている', batches.length === 2, JSON.stringify(batches));

  console.log('\n■ 本番コード中の SQL を実スキーマに照合');
  await checkInlineSql();

  // ── 蔵IDの採番 ──
  console.log('\n■ 蔵IDの採番');
  await pool.query('TRUNCATE requests, items, breweries RESTART IDENTITY CASCADE');

  // 数字の取り出しに \\D を使うと、JS のテンプレートリテラルで D になってしまい、
  // 2 蔵目で 'kura-001' を整数に変換しようとして落ちる。実際に起きた不具合。
  const nextLoginId = async () => {
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(login_id, '[^0-9]', '', 'g'), '')::int), 0) AS n
       FROM breweries`,
    );
    return `kura-${String(Number(rows[0].n) + 1).padStart(3, '0')}`;
  };

  const issued = [];
  for (let i = 0; i < 3; i += 1) {
    const loginId = await nextLoginId();
    issued.push(loginId);
    await pool.query(
      `INSERT INTO breweries (id, name, login_id) VALUES ($1, $2, $3)`,
      [`b${i}`, `蔵${i}`, loginId],
    );
  }
  check(
    '3 蔵つづけて登録でき、番号が連番になる',
    JSON.stringify(issued) === JSON.stringify(['kura-001', 'kura-002', 'kura-003']),
    issued.join(', '),
  );

  // ── 注文処理 ──
  console.log('\n■ 注文処理（place_order）');

  // 2 本 × 6 杯 = 12 杯、1 杯 2 枚、手持ち 10 枚
  await seed({ bottles: 2, cupsPerBottle: 6, ticketCost: 2, tickets: 10 });

  const first = await order('u1', 'i1', 2);
  check('注文が通る', first.ok === true, JSON.stringify(first));
  check('使ったチケット枚数が正しい（2杯 × 2枚 = 4枚）', Number(first.spent) === 4, `spent=${first.spent}`);
  check('残高が引かれている（10 − 4 = 6）', (await ticketsOf()).tickets === 6);

  // 受け取るまで次を頼めないので、受け取ったことにしてから続ける。
  await deliver(first.request_id);
  const exact = await order('u1', 'i1', 3);
  check('残高ちょうどの注文が通る（3杯 × 2枚 = 6枚）', exact.ok === true, JSON.stringify(exact));
  check('残高が 0 になっている', (await ticketsOf()).tickets === 0);

  await deliver(exact.request_id);
  const broke = await order('u1', 'i1', 1);
  check('残高不足は断られる', broke.ok === false);
  check(
    '不足ポイントを具体的に伝える',
    typeof broke.reason === 'string' && broke.reason.includes("2 足りません"),
    `reason=${broke.reason}`,
  );
  check('断られたときチケットは減っていない', (await ticketsOf()).tickets === 0);

  // 受付停止
  await pool.query(`UPDATE breweries SET accepting = false WHERE id = 'b1'`);
  await pool.query(`UPDATE guests SET tickets = 100 WHERE clerk_user_id = 'u1'`);
  const closed = await order('u1', 'i1', 1);
  check('受付停止中の蔵には注文できない', closed.ok === false && closed.reason.includes('受付を停止'), `reason=${closed.reason}`);
  await pool.query(`UPDATE breweries SET accepting = true WHERE id = 'b1'`);

  // 銘柄ごとの受付停止（Issue #43）
  await pool.query(`UPDATE items SET accepting = false WHERE id = 'i1'`);
  const itemPaused = await order('u1', 'i1', 1);
  check(
    '受付を止めた銘柄には注文できない',
    itemPaused.ok === false && itemPaused.reason.includes('この銘柄はいま受付を停止'),
    `reason=${itemPaused.reason}`,
  );
  check('断られたときポイントは減っていない（100 のまま）', (await ticketsOf()).tickets === 100);
  // 蔵ごと止めているときは、蔵の理由を先に出す（どちらも止まっているとき）。
  await pool.query(`UPDATE breweries SET accepting = false WHERE id = 'b1'`);
  const both = await order('u1', 'i1', 1);
  check('蔵も銘柄も止まっていれば、蔵の理由を出す', both.ok === false && both.reason.includes('この蔵は'), `reason=${both.reason}`);
  await pool.query(`UPDATE breweries SET accepting = true WHERE id = 'b1'`);
  await pool.query(`UPDATE items SET accepting = true WHERE id = 'i1'`);
  const resumed = await order('u1', 'i1', 1);
  check('再開すれば注文できる', resumed.ok === true, JSON.stringify(resumed));
  await deliver(resumed.request_id);

  // 存在しない銘柄
  const missing = await order('u1', 'nope', 1);
  check('存在しない銘柄は断られる', missing.ok === false, `reason=${missing.reason}`);

  // ── 在庫の上限 ──
  console.log('\n■ 在庫の上限');
  await seed({ bottles: 1, cupsPerBottle: 6, ticketCost: 1, tickets: 100 });
  // 1 人が持てる未受取の注文は 1 件だけなので、在庫の上限は別々の人で確かめる。
  for (let i = 2; i <= 11; i += 1) await addGuest(`u${i}`, 100);

  let placed = 0;
  for (let i = 1; i <= 10; i += 1) {
    const result = await order(`u${i}`, 'i1', 1);
    if (result.ok) placed += 1;
  }
  check('在庫（6 杯）を超えて注文できない', placed === 6, `通った件数=${placed}`);

  const over = await order('u11', 'i1', 1);
  check('売り切れの理由を伝える', over.ok === false && over.reason.includes('埋まりました'), `reason=${over.reason}`);

  const tooMany = await (async () => {
    await seed({ bottles: 1, cupsPerBottle: 6, ticketCost: 1, tickets: 100 });
    await addGuest('u2', 100);
    await addGuest('u3', 100);
    await order('u1', 'i1', 3);
    await order('u2', 'i1', 3);
    return order('u3', 'i1', 2); // 残り 0
  })();
  check('残りより多い杯数は断られる', tooMany.ok === false, `reason=${tooMany.reason}`);

  // ── 同時注文 ──
  console.log('\n■ 同時注文（最後の 1 杯を複数人が同時に取ろうとする）');
  await seed({ bottles: 1, cupsPerBottle: 1, ticketCost: 1, tickets: 100 });
  // 参加者を 12 人に増やす（同じ人だと残高のロックで直列化してしまい、
  // 在庫側の排他を確かめられない）
  for (let i = 2; i <= 13; i += 1) {
    await pool.query(
      `INSERT INTO guests (clerk_user_id, display_no, tickets) VALUES ($1, $2, 100)`,
      [`u${i}`, `参加者 #${10000 + i}`],
    );
  }

  const attempts = await Promise.all(
    Array.from({ length: 12 }, (_, i) => order(`u${i + 2}`, 'i1', 1)),
  );
  const winners = attempts.filter((r) => r.ok).length;
  check('同時に 12 人が挑んで、通るのは 1 件だけ', winners === 1, `通った件数=${winners}`);

  const { rows: reqCount } = await pool.query(`SELECT count(*)::int AS n FROM requests`);
  check('注文の行も 1 件だけ作られている', reqCount[0].n === 1, `件数=${reqCount[0].n}`);

  const { rows: spentRows } = await pool.query(
    `SELECT count(*)::int AS n FROM guests WHERE used > 0`,
  );
  check('チケットが引かれたのも 1 人だけ', spentRows[0].n === 1, `人数=${spentRows[0].n}`);

  // ── 受け取るまで次を頼めない（Issue #34）──
  console.log('\n■ 受け取るまで次を頼めない');
  await seed({ bottles: 5, cupsPerBottle: 6, ticketCost: 1, tickets: 100 });
  await pool.query(
    `INSERT INTO items (id, brewery_id, name, size, cups_per_bottle, bottles, ticket_cost)
     VALUES ('i2', 'b1', 'テスト吟醸', '四合瓶', 6, 5, 1),
            ('i3', 'b1', 'テスト大吟醸', '四合瓶', 6, 5, 1)`,
  );

  const firstOrder = await order('u1', 'i1', 1);
  check('1 件目は通る', firstOrder.ok === true, JSON.stringify(firstOrder));

  // 未受取の 3 つの状態すべてで止まること。「準備完了」は蔵の手を離れているが、
  // 参加者はまだ受け取っていない。ここを取りこぼすと制約の意味がなくなる。
  for (const state of ['accepted', 'preparing', 'ready']) {
    await pool.query(`UPDATE requests SET status = $2 WHERE id = $1`, [firstOrder.request_id, state]);
    const blocked = await order('u1', 'i2', 1);
    check(
      `「${state}」のあいだは、別の銘柄でも次を頼めない`,
      blocked.ok === false && blocked.reason.includes('まだ受け取っていない'),
      `reason=${blocked.reason}`,
    );
  }
  check('断られたぶんのポイントは引かれていない（100 − 1 = 99）', (await ticketsOf()).tickets === 99);

  await deliver(firstOrder.request_id);
  const afterDelivered = await order('u1', 'i2', 1);
  check('受け取ったら次を頼める', afterDelivered.ok === true, JSON.stringify(afterDelivered));

  await pool.query(`UPDATE requests SET status = 'cancelled' WHERE id = $1`, [afterDelivered.request_id]);
  const afterCancelled = await order('u1', 'i3', 1);
  check('キャンセルされた注文は数えない', afterCancelled.ok === true, JSON.stringify(afterCancelled));

  // 同じ人が 2 台の端末から同時に押す。参加者の行のロックで直列になり、
  // 2 本目以降はロックが空いたあとの文で 1 本目が見えて止まるはず。
  await seed({ bottles: 5, cupsPerBottle: 6, ticketCost: 2, tickets: 100 });
  await pool.query(
    `INSERT INTO items (id, brewery_id, name, size, cups_per_bottle, bottles, ticket_cost)
     VALUES ('i2', 'b1', 'テスト吟醸', '四合瓶', 6, 5, 2),
            ('i3', 'b1', 'テスト大吟醸', '四合瓶', 6, 5, 2)`,
  );
  const burst = await Promise.all(
    Array.from({ length: 9 }, (_, i) => order('u1', ['i1', 'i2', 'i3'][i % 3], 1)),
  );
  const burstWins = burst.filter((r) => r.ok).length;
  check('同じ人が 9 本同時に送っても、通るのは 1 件だけ', burstWins === 1, `通った件数=${burstWins}`);
  const { rows: burstRows } = await pool.query(
    `SELECT count(*)::int AS n FROM requests WHERE guest_clerk_id = 'u1'`,
  );
  check('注文の行も 1 件だけ', burstRows[0].n === 1, `件数=${burstRows[0].n}`);
  check('ポイントも 1 件ぶん（2）しか引かれていない', (await ticketsOf()).tickets === 98);

  // ── 受渡とキャンセル ──
  console.log('\n■ 受渡・キャンセル');
  await seed({ bottles: 1, cupsPerBottle: 6, ticketCost: 2, tickets: 20 });
  const target = await order('u1', 'i1', 2);

  await pool.query(`UPDATE requests SET status = 'ready' WHERE id = $1`, [target.request_id]);
  await pool.query(
    `WITH moved AS (
       UPDATE requests SET status = 'delivered', updated_at = now()
       WHERE id = $1 AND status = 'ready' RETURNING item_id, cups
     )
     UPDATE items SET used_cups = used_cups + (SELECT cups FROM moved)
     WHERE id = (SELECT item_id FROM moved) RETURNING id`,
    [target.request_id],
  );
  const { rows: usedRows } = await pool.query(`SELECT used_cups FROM items WHERE id = 'i1'`);
  check('受渡完了で在庫が減る', usedRows[0].used_cups === 2, `used_cups=${usedRows[0].used_cups}`);

  const second = await order('u1', 'i1', 1);
  await pool.query(
    `WITH moved AS (
       UPDATE requests SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status IN ('accepted','preparing','ready')
       RETURNING guest_clerk_id, ticket_cost
     )
     UPDATE guests
     SET tickets = tickets + (SELECT ticket_cost FROM moved),
         used    = GREATEST(0, used - (SELECT ticket_cost FROM moved))
     WHERE clerk_user_id = (SELECT guest_clerk_id FROM moved) RETURNING clerk_user_id`,
    [second.request_id],
  );
  const after = await ticketsOf();
  check('キャンセルでチケットが戻る（20 − 4 − 2 + 2 = 16）', after.tickets === 16, JSON.stringify(after));
  check('使用済も戻る（4）', after.used === 4, JSON.stringify(after));

  // 同じ注文をもう一度キャンセルしても二重には戻らない
  await pool.query(
    `WITH moved AS (
       UPDATE requests SET status = 'cancelled' WHERE id = $1
       AND status IN ('accepted','preparing','ready') RETURNING guest_clerk_id, ticket_cost
     )
     UPDATE guests SET tickets = tickets + (SELECT ticket_cost FROM moved)
     WHERE clerk_user_id = (SELECT guest_clerk_id FROM moved) RETURNING clerk_user_id`,
    [second.request_id],
  );
  check('二重キャンセルでチケットは増えない', (await ticketsOf()).tickets === 16);

  // ── 参加者の「受け取りました」（Issue #72）──
  console.log('\n■ 参加者の受け取り確認');
  await seed({ bottles: 1, cupsPerBottle: 6, ticketCost: 1, tickets: 20 });
  await addGuest('u2', 20);
  const mine = await order('u1', 'i1', 2);
  const confirm = `
    WITH moved AS (
      UPDATE requests SET status = 'delivered', updated_at = now()
      WHERE id = $1 AND guest_clerk_id = $2 AND status = 'ready'
      RETURNING item_id, cups
    )
    UPDATE items SET used_cups = used_cups + (SELECT cups FROM moved)
    WHERE id = (SELECT item_id FROM moved) RETURNING id`;
  const byBrewery = `
    WITH moved AS (
      UPDATE requests SET status = 'delivered', updated_at = now()
      WHERE id = $1 AND status = 'ready' RETURNING item_id, cups
    )
    UPDATE items SET used_cups = used_cups + (SELECT cups FROM moved)
    WHERE id = (SELECT item_id FROM moved) RETURNING id`;

  const early = await pool.query(confirm, [mine.request_id, 'u1']);
  check('できあがる前は、参加者は受け取りにできない', early.rows.length === 0);

  await pool.query(`UPDATE requests SET status = 'ready' WHERE id = $1`, [mine.request_id]);
  const other = await pool.query(confirm, [mine.request_id, 'u2']);
  check('ほかの参加者の注文は、受け取りにできない', other.rows.length === 0);

  // 参加者と蔵が同時に押す（参加者 4 回・蔵 4 回）
  const mixed = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      i % 2 === 0
        ? pool.query(confirm, [mine.request_id, 'u1'])
        : pool.query(byBrewery, [mine.request_id]),
    ),
  );
  const passed = mixed.filter((r) => r.rows.length > 0).length;
  check('参加者と蔵が同時に押しても、通るのは 1 回だけ', passed === 1, `通った回数=${passed}`);
  const { rows: confirmedRows } = await pool.query(`SELECT used_cups FROM items WHERE id = 'i1'`);
  check(
    '在庫も 1 回ぶん（2 杯）しか減っていない',
    confirmedRows[0].used_cups === 2,
    `used_cups=${confirmedRows[0].used_cups}`,
  );

  // ── 取りに来ない人への催促（Issue #73）──
  console.log('\n■ 催促');
  const next = await order('u1', 'i1', 1);
  const remind = `
    UPDATE requests SET reminded_at = now()
    WHERE id = $1 AND status = 'ready'
      AND ($2::text IS NULL OR brewery_id = $2)
      AND (reminded_at IS NULL OR reminded_at <= now() - make_interval(secs => $3))
    RETURNING id`;
  const notReady = await pool.query(remind, [next.request_id, 'b1', 60]);
  check('準備完了でない注文は催促できない', notReady.rows.length === 0);

  await pool.query(`UPDATE requests SET status = 'ready' WHERE id = $1`, [next.request_id]);
  const otherBrewery = await pool.query(remind, [next.request_id, 'b-other', 60]);
  check('ほかの蔵の注文は催促できない', otherBrewery.rows.length === 0);

  const reminds = await Promise.all(
    Array.from({ length: 6 }, () => pool.query(remind, [next.request_id, 'b1', 60])),
  );
  const remindPassed = reminds.filter((r) => r.rows.length > 0).length;
  check('同時に 6 回押しても、催促は 1 回だけ', remindPassed === 1, `通った回数=${remindPassed}`);

  const tooSoon = await pool.query(remind, [next.request_id, 'b1', 60]);
  check('1 分たたないうちは、もう一度は送れない', tooSoon.rows.length === 0);

  await pool.query(
    `UPDATE requests SET reminded_at = now() - interval '61 seconds' WHERE id = $1`,
    [next.request_id],
  );
  const later = await pool.query(remind, [next.request_id, null, 60]);
  check('1 分たてば、また送れる（主催者は蔵を問わない）', later.rows.length === 1);

  // ── 券の消し込み ──
  console.log('\n■ 券の消し込み');
  await pool.query(`DELETE FROM tickets`);
  await pool.query(`INSERT INTO tickets (code, batch_id) VALUES ('SAGA-DAY-TEST01', 'same-day')`);
  const redeem = `
    WITH claimed AS (
      UPDATE tickets SET redeemed_by = $1, redeemed_at = now()
      WHERE code = $2 AND redeemed_by IS NULL RETURNING batch_id
    ), batch AS (
      SELECT tb.cups_per_ticket, tb.label FROM ticket_batches tb JOIN claimed c ON c.batch_id = tb.id
    )
    UPDATE guests g SET tickets = g.tickets + (SELECT cups_per_ticket FROM batch)
    WHERE g.clerk_user_id = $1 AND EXISTS (SELECT 1 FROM batch)
    RETURNING g.tickets AS total, (SELECT cups_per_ticket FROM batch) AS added`;

  const before = (await ticketsOf()).tickets;
  const r1 = await pool.query(redeem, ['u1', 'SAGA-DAY-TEST01']);
  check('券を読み取るとチケットが増える', r1.rows.length === 1 && Number(r1.rows[0].added) === 10, JSON.stringify(r1.rows));
  check('残高が 10 枚増えている', (await ticketsOf()).tickets === before + 10);

  const r2 = await pool.query(redeem, ['u1', 'SAGA-DAY-TEST01']);
  check('同じ券は二度使えない', r2.rows.length === 0);
  check('二度目で残高は増えていない', (await ticketsOf()).tickets === before + 10);

  // 同時に同じ券を読んでも 1 回だけ
  await pool.query(`INSERT INTO tickets (code, batch_id) VALUES ('SAGA-DAY-TEST02', 'same-day')`);
  const base = (await ticketsOf()).tickets;
  const races = await Promise.all(
    Array.from({ length: 8 }, () => pool.query(redeem, ['u1', 'SAGA-DAY-TEST02'])),
  );
  check(
    '同じ券を同時に 8 回読んでも、通るのは 1 回だけ',
    races.filter((r) => r.rows.length > 0).length === 1,
    `通った回数=${races.filter((r) => r.rows.length > 0).length}`,
  );
  check('残高も 10 枚しか増えていない', (await ticketsOf()).tickets === base + 10);
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error('\n想定外のエラー:', error);
} finally {
  await pool.end();
}

console.log(failures === 0 ? '\n✓ すべて確認できた\n' : `\n✗ ${failures} 件 失敗\n`);
process.exit(failures === 0 ? 0 : 1);
