/**
 * DB の読み書き。ここから外へ出るのは domain.ts の型だけ。
 *
 * ★ 整合性の方針 ★
 * 在庫とチケットは「二重に減る / 二重に戻る」が絶対に許されない。
 * Neon の HTTP ドライバは「読んで、考えて、書く」を 1 トランザクションに
 * まとめられないので、危険な操作は WHERE で条件を付けた 1 本の SQL
 * （CTE 付き UPDATE）として書き、原子性を文そのものに持たせている。
 * 0 行返ってきたら「条件を満たさなかった」＝失敗、と判断する。
 */

import { randomInt } from 'node:crypto';

import { getSql } from './db';
import { ensureSchema } from './schema';
import {
  CUPS_PER_BOTTLE,
  type BottleSize,
  type Brewery,
  type EventPhase,
  type EventSettings,
  type GuestKind,
  type Guest,
  type Item,
  type OrderRequest,
  type RequestStatus,
  type Inquiry,
  type TicketBatch,
} from './domain';

async function db() {
  await ensureSchema();
  return getSql();
}

/** 操作の結果。失敗の理由を画面にそのまま出せる日本語で返す。 */
export type Result<T = void> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: string): Result<never> => ({ ok: false, reason });

// ─────────────────────────────────────────────────────────────
// イベント設定
// ─────────────────────────────────────────────────────────────

export async function getEvent(): Promise<EventSettings> {
  const sql = await db();
  const rows = (await sql`
    SELECT name, event_date, start_time, end_time, phase, target_brewery_count
    FROM events WHERE id = 1
  `) as Record<string, unknown>[];

  const row = rows[0];
  return {
    name: String(row?.name ?? '佐賀 蔵めぐり'),
    // date 型は Date で返ることがあるので 'YYYY-MM-DD' に正規化する
    eventDate: toDateString(row?.event_date),
    startTime: String(row?.start_time ?? '11:00'),
    endTime: String(row?.end_time ?? '16:00'),
    // 'before' は旧データ。移行前に読んでも壊れないよう auto に寄せる。
    phase: row?.phase === 'open' || row?.phase === 'closed' ? row.phase : 'auto',
    targetBreweryCount: Number(row?.target_brewery_count ?? 30),
  };
}

/**
 * date 型を 'YYYY-MM-DD' にそろえる。
 *
 * ★ toISOString を使ってはいけない ★
 * ドライバは date を「その日のローカル 0 時」の Date にして返す。日本時間で
 * toISOString() すると UTC に直る際に 9 時間戻り、開催日が 1 日前になる。
 * 実際にこれで 9/20 が 9/19 と表示された。必ずローカルの年月日を組み立てる。
 */
function toDateString(value: unknown): string {
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  if (value instanceof Date) return format(value);
  if (typeof value === 'string') return value.slice(0, 10);
  return format(new Date());
}

export async function updateEvent(patch: Partial<EventSettings>): Promise<Result<EventSettings>> {
  const sql = await db();
  const current = await getEvent();
  const next: EventSettings = { ...current, ...patch };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.eventDate)) return fail('開催日の形式が正しくありません。');
  if (!/^\d{2}:\d{2}$/.test(next.startTime)) return fail('開始時刻の形式が正しくありません。');
  if (!/^\d{2}:\d{2}$/.test(next.endTime)) return fail('終了時刻の形式が正しくありません。');
  if (next.targetBreweryCount < 1) return fail('参加酒蔵数は 1 以上にしてください。');

  await sql`
    UPDATE events SET
      name = ${next.name},
      event_date = ${next.eventDate},
      start_time = ${next.startTime},
      end_time = ${next.endTime},
      phase = ${next.phase},
      target_brewery_count = ${next.targetBreweryCount},
      updated_at = now()
    WHERE id = 1
  `;
  return ok(next);
}

// ─────────────────────────────────────────────────────────────
// 酒蔵と銘柄
// ─────────────────────────────────────────────────────────────

export async function listBreweries(): Promise<Brewery[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT
      b.id, b.name, b.area, b.booth, b.accepting, b.login_id,
      (b.clerk_user_id IS NOT NULL) AS has_login_account,
      i.id  AS item_id, i.name AS item_name, i.kind, i.polish, i.size,
      i.cups_per_bottle, i.bottles, i.used_cups, i.ticket_cost,
      COALESCE((
        SELECT sum(r.cups) FROM requests r
        WHERE r.item_id = i.id AND r.status IN ('accepted', 'preparing', 'ready')
      ), 0) AS pending_cups
    FROM breweries b
    LEFT JOIN items i ON i.brewery_id = b.id
    ORDER BY b.sort_order, b.created_at, i.created_at
  `) as Record<string, unknown>[];

  const byId = new Map<string, Brewery>();
  for (const row of rows) {
    const id = String(row.id);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: String(row.name),
        area: String(row.area),
        booth: String(row.booth),
        accepting: Boolean(row.accepting),
        loginId: String(row.login_id),
        hasLoginAccount: Boolean(row.has_login_account),
        items: [],
      });
    }
    if (row.item_id) {
      byId.get(id)!.items.push({
        id: String(row.item_id),
        breweryId: id,
        name: String(row.item_name),
        kind: String(row.kind),
        polish: Number(row.polish),
        size: row.size as BottleSize,
        cupsPerBottle: Number(row.cups_per_bottle),
        bottles: Number(row.bottles),
        usedCups: Number(row.used_cups),
        pendingCups: Number(row.pending_cups),
        ticketCost: Number(row.ticket_cost),
      });
    }
  }
  return [...byId.values()];
}

/** 紛らわしい文字（0/O/1/l/i）を抜いた英数字。手で写しても間違えない。 */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * 蔵に配るパスワードを作る。
 * Math.random は使わない（予測可能なので、印刷して配る資格情報には不適切）。
 */
export function generatePassword(): string {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += i === 5 || i === 11 ? '-' : PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

/** 次の蔵 ID（kura-001, kura-002 …）。欠番は埋めず、常に最大値 +1。 */
async function nextLoginId(): Promise<string> {
  const sql = await db();
  const rows = (await sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(login_id, '\D', '', 'g'), '')::int), 0) AS n
    FROM breweries
  `) as { n: number }[];
  return `kura-${String(Number(rows[0]?.n ?? 0) + 1).padStart(3, '0')}`;
}

export async function createBrewery(input: {
  name: string;
  /** 省略できる。会場ではブース番号のほうが役に立つので必須にしない。 */
  area?: string;
}): Promise<Result<{ id: string; loginId: string; password: string }>> {
  const name = input.name.trim();
  if (!name) return fail('酒蔵名を入力してください。');

  const sql = await db();
  const id = `brew_${randomInt(1e9).toString(36)}${Date.now().toString(36)}`;
  const loginId = await nextLoginId();
  const password = generatePassword();

  // ブース番号は割り当てない。主催者が画面から変えられない番号を配ると、
  // 実際の配置と食い違ったまま来場者を別の場所へ案内してしまう。
  const booth = '';

  await sql`
    INSERT INTO breweries (id, name, area, booth, login_id, sort_order)
    VALUES (${id}, ${name}, ${input.area ?? ''}, ${booth}, ${loginId},
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM breweries))
  `;

  // 参加酒蔵数の目標より実数が多くなったら、目標を引き上げておく。
  await sql`
    UPDATE events SET target_brewery_count = GREATEST(
      target_brewery_count, (SELECT count(*) FROM breweries)
    ) WHERE id = 1
  `;

  return ok({ id, loginId, password });
}

export async function linkBreweryClerkUser(breweryId: string, clerkUserId: string): Promise<void> {
  const sql = await db();
  await sql`UPDATE breweries SET clerk_user_id = ${clerkUserId} WHERE id = ${breweryId}`;
}

export async function getBreweryClerkUserId(breweryId: string): Promise<string | null> {
  const sql = await db();
  const rows = (await sql`
    SELECT clerk_user_id FROM breweries WHERE id = ${breweryId}
  `) as { clerk_user_id: string | null }[];
  return rows[0]?.clerk_user_id ?? null;
}

export async function deleteBrewery(breweryId: string): Promise<Result> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM breweries WHERE id = ${breweryId} RETURNING id
  `) as { id: string }[];
  return rows.length > 0 ? ok(undefined) : fail('その酒蔵は見つかりませんでした。');
}

export async function setAccepting(breweryId: string, accepting: boolean): Promise<Result> {
  const sql = await db();
  const rows = (await sql`
    UPDATE breweries SET accepting = ${accepting} WHERE id = ${breweryId} RETURNING id
  `) as { id: string }[];
  return rows.length > 0 ? ok(undefined) : fail('その酒蔵は見つかりませんでした。');
}

export async function moveBooth(breweryId: string, direction: 1 | -1): Promise<Result> {
  const { BOOTHS } = await import('./domain');
  const sql = await db();
  const rows = (await sql`SELECT booth FROM breweries WHERE id = ${breweryId}`) as {
    booth: string;
  }[];
  if (rows.length === 0) return fail('その酒蔵は見つかりませんでした。');

  const current = BOOTHS.indexOf(rows[0].booth as (typeof BOOTHS)[number]);
  const from = current < 0 ? 0 : current;
  const next = BOOTHS[(from + direction + BOOTHS.length) % BOOTHS.length];

  await sql`UPDATE breweries SET booth = ${next} WHERE id = ${breweryId}`;
  return ok(undefined);
}

export async function addItem(
  breweryId: string,
  input: { name: string; kind: string; polish: number; size: BottleSize; ticketCost: number },
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail('銘柄名を入力してください。');
  const { MAX_TICKET_COST } = await import('./domain');
  if (input.ticketCost < 1 || input.ticketCost > MAX_TICKET_COST) {
    return fail(`ポイントは 1〜${MAX_TICKET_COST} です。`);
  }

  const sql = await db();
  const id = `item_${randomInt(1e9).toString(36)}${Date.now().toString(36)}`;
  const cupsPerBottle = CUPS_PER_BOTTLE[input.size] ?? 6;

  await sql`
    INSERT INTO items (id, brewery_id, name, kind, polish, size, cups_per_bottle, ticket_cost)
    VALUES (${id}, ${breweryId}, ${name}, ${input.kind},
            ${Math.max(0, Math.min(100, Math.round(input.polish)))},
            ${input.size}, ${cupsPerBottle}, ${input.ticketCost})
  `;
  return ok({ id });
}

/**
 * 本数を増減する。
 *
 * 「すでに注いだ杯数」と「受けたけれどまだ渡していない注文の杯数」を
 * 下回る本数には減らせない。減らせてしまうと、受けた注文を出せなくなる。
 */
export async function changeBottles(itemId: string, delta: number): Promise<Result> {
  const sql = await db();
  const rows = (await sql`
    UPDATE items SET bottles = bottles + ${delta}
    WHERE id = ${itemId}
      AND bottles + ${delta} >= 0
      AND (bottles + ${delta}) * cups_per_bottle >= used_cups + COALESCE((
            SELECT sum(r.cups) FROM requests r
            WHERE r.item_id = items.id AND r.status IN ('accepted', 'preparing', 'ready')
          ), 0)
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0
    ? ok(undefined)
    : fail('これ以上減らせません。お渡しした分と、受けている注文の分は残す必要があります。');
}

export async function setItemTicketCost(itemId: string, ticketCost: number): Promise<Result> {
  const { MAX_TICKET_COST } = await import('./domain');
  if (ticketCost < 1 || ticketCost > MAX_TICKET_COST) {
    return fail(`ポイントは 1〜${MAX_TICKET_COST} です。`);
  }
  const sql = await db();
  const rows = (await sql`
    UPDATE items SET ticket_cost = ${ticketCost} WHERE id = ${itemId} RETURNING id
  `) as { id: string }[];
  return rows.length > 0 ? ok(undefined) : fail('その銘柄は見つかりませんでした。');
}

/** 銘柄を消す。注文が付いているものは消さない（履歴が壊れるため）。 */
export async function removeItem(itemId: string): Promise<Result> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM items
    WHERE id = ${itemId}
      AND NOT EXISTS (SELECT 1 FROM requests WHERE item_id = ${itemId})
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0
    ? ok(undefined)
    : fail('この銘柄にはすでに注文があるため消せません。本数を 0 にしてください。');
}

// ─────────────────────────────────────────────────────────────
// チケット
// ─────────────────────────────────────────────────────────────

export async function listTicketBatches(): Promise<TicketBatch[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT
      tb.id, tb.label, tb.code, tb.cups_per_ticket,
      count(t.code)                                        AS issued,
      count(t.code) FILTER (WHERE t.redeemed_by IS NOT NULL) AS redeemed
    FROM ticket_batches tb
    LEFT JOIN tickets t ON t.batch_id = tb.id
    GROUP BY tb.id, tb.label, tb.code, tb.cups_per_ticket, tb.sort_order
    ORDER BY tb.sort_order
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    label: String(r.label),
    code: String(r.code),
    cupsPerTicket: Number(r.cups_per_ticket),
    issued: Number(r.issued),
    redeemed: Number(r.redeemed),
  }));
}

/** QR に載せる券コード。SAGA-DAY-7F3K9QX2 のような形。 */
function makeTicketCode(prefix: string): string {
  let tail = '';
  for (let i = 0; i < 10; i += 1) tail += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return `${prefix}-${tail.toUpperCase()}`;
}

export async function issueTickets(batchId: string, count: number): Promise<Result<number>> {
  if (count < 1 || count > 2000) return fail('一度に発行できるのは 1〜2000 枚です。');

  const sql = await db();
  const batch = (await sql`
    SELECT code FROM ticket_batches WHERE id = ${batchId}
  `) as { code: string }[];
  if (batch.length === 0) return fail('その券種は見つかりませんでした。');

  const codes = Array.from({ length: count }, () => makeTicketCode(batch[0].code));
  await sql`
    INSERT INTO tickets (code, batch_id)
    SELECT unnest(${codes}::text[]), ${batchId}
    ON CONFLICT (code) DO NOTHING
  `;
  return ok(count);
}

/**
 * 券 1 枚で何枚分のチケットになるかを変える。
 *
 * すでに発行して配った券の価値まで変わってしまうので、
 * まだ 1 枚も発行していない券種でだけ変更を許す。
 */
export async function setCupsPerTicket(batchId: string, cups: number): Promise<Result> {
  if (cups < 1 || cups > 100) return fail('1〜100 枚のあいだで指定してください。');

  const sql = await db();
  const rows = (await sql`
    UPDATE ticket_batches SET cups_per_ticket = ${cups}
    WHERE id = ${batchId}
      AND NOT EXISTS (SELECT 1 FROM tickets WHERE batch_id = ${batchId})
    RETURNING id
  `) as { id: string }[];

  return rows.length > 0
    ? ok(undefined)
    : fail('すでに発行した券があるため変更できません。先に発行済みの券を使い切るか、別の券種をお使いください。');
}

/**
 * 用意する券の枚数を「この数にする」形で決める。
 *
 * 主催者の頭の中では「前売を 300 枚用意する」であって、「いま何枚あるから
 * あと何枚足す」ではない。足し算を人にさせないために、目標の数を受け取って
 * 差分をこちらで埋める。
 *
 * 減らす方向は、まだ読み取られていない券からしか削れない。すでに誰かの
 * 手に渡って読み取られた券を消すと、その人の残高の裏づけが無くなるため。
 */
export async function setTicketCount(
  batchId: string,
  target: number,
): Promise<Result<{ issued: number; added: number; removed: number }>> {
  if (target < 0 || target > 5000) return fail('0〜5000 枚のあいだで指定してください。');

  const sql = await db();
  const rows = (await sql`
    SELECT
      count(*)::int                                        AS issued,
      count(*) FILTER (WHERE redeemed_by IS NULL)::int     AS unredeemed
    FROM tickets WHERE batch_id = ${batchId}
  `) as { issued: number; unredeemed: number }[];

  const issued = Number(rows[0]?.issued ?? 0);
  const unredeemed = Number(rows[0]?.unredeemed ?? 0);

  if (target === issued) return ok({ issued, added: 0, removed: 0 });

  if (target > issued) {
    const added = target - issued;
    const result = await issueTickets(batchId, added);
    if (!result.ok) return result;
    return ok({ issued: target, added, removed: 0 });
  }

  const removing = issued - target;
  if (removing > unredeemed) {
    return fail(
      `すでに ${issued - unredeemed} 枚が読み取られているため、${issued - unredeemed} 枚より少なくはできません。`,
    );
  }

  const removed = (await sql`
    DELETE FROM tickets
    WHERE code IN (
      SELECT code FROM tickets
      WHERE batch_id = ${batchId} AND redeemed_by IS NULL
      ORDER BY created_at DESC, code DESC
      LIMIT ${removing}
    )
    RETURNING code
  `) as { code: string }[];

  return ok({ issued: target, added: 0, removed: removed.length });
}

/** 発行した券をすべて取り消す。まだ 1 枚も読み取られていない場合だけ。 */
export async function discardTickets(batchId: string): Promise<Result<number>> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM tickets
    WHERE batch_id = ${batchId} AND redeemed_by IS NULL
    RETURNING code
  `) as { code: string }[];
  return ok(rows.length);
}

export interface TicketRow {
  code: string;
  /** 参加者が使い終わっているか。使い終わった券は二度と使えない。 */
  redeemed: boolean;
}

/** 券のコードを、使われたかどうかとあわせて一覧する。 */
export async function listTickets(batchId: string, limit = 500): Promise<TicketRow[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT code, (redeemed_by IS NOT NULL) AS redeemed
    FROM tickets WHERE batch_id = ${batchId}
    ORDER BY (redeemed_by IS NOT NULL), created_at, code
    LIMIT ${limit}
  `) as { code: string; redeemed: boolean }[];
  return rows.map((r) => ({ code: String(r.code), redeemed: Boolean(r.redeemed) }));
}

/** 印刷用に、まだ読み取られていない券コードを取り出す。 */
export async function listUnredeemedCodes(batchId: string, limit = 500): Promise<string[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT code FROM tickets
    WHERE batch_id = ${batchId} AND redeemed_by IS NULL
    ORDER BY created_at, code
    LIMIT ${limit}
  `) as { code: string }[];
  return rows.map((r) => r.code);
}

/**
 * 券を読み取ってチケットを加算する。
 *
 * 1 本の SQL で「まだ使われていない券を押さえる」と「参加者に加算する」を
 * 同時に行う。同じ QR を 2 台で同時に読んでも、先に届いた 1 回だけが成功する。
 */
export async function redeemTicket(
  code: string,
  clerkUserId: string,
): Promise<Result<{ added: number; total: number; label: string }>> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return fail('券コードが読み取れませんでした。');

  const sql = await db();
  const rows = (await sql`
    WITH claimed AS (
      UPDATE tickets
      SET redeemed_by = ${clerkUserId}, redeemed_at = now()
      WHERE code = ${normalized} AND redeemed_by IS NULL
      RETURNING batch_id
    ),
    batch AS (
      SELECT tb.cups_per_ticket, tb.label
      FROM ticket_batches tb JOIN claimed c ON c.batch_id = tb.id
    )
    UPDATE guests g
    SET tickets = g.tickets + (SELECT cups_per_ticket FROM batch)
    WHERE g.clerk_user_id = ${clerkUserId} AND EXISTS (SELECT 1 FROM batch)
    RETURNING
      g.tickets                              AS total,
      (SELECT cups_per_ticket FROM batch)    AS added,
      (SELECT label           FROM batch)    AS label
  `) as { total: number; added: number; label: string }[];

  if (rows.length === 0) {
    // 券が無い / すでに読み取り済みのどちらか。参加者に区別を伝える。
    const seen = (await sql`
      SELECT redeemed_by FROM tickets WHERE code = ${normalized}
    `) as { redeemed_by: string | null }[];
    if (seen.length === 0) return fail('この券は登録されていません。券面を確認してください。');
    return fail('この券はすでに読み取り済みです。');
  }

  return ok({
    added: Number(rows[0].added),
    total: Number(rows[0].total),
    label: String(rows[0].label),
  });
}

// ─────────────────────────────────────────────────────────────
// 参加者
// ─────────────────────────────────────────────────────────────

export async function getOrCreateGuest(clerkUserId: string): Promise<Guest> {
  const sql = await db();
  const rows = (await sql`
    INSERT INTO guests (clerk_user_id) VALUES (${clerkUserId})
    ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
    RETURNING clerk_user_id, display_no, kind, tickets, used
  `) as Record<string, unknown>[];

  const row = rows[0];
  return {
    clerkUserId: String(row.clerk_user_id),
    displayNo: String(row.display_no),
    kind: row.kind as GuestKind,
    tickets: Number(row.tickets),
    used: Number(row.used),
  };
}

// ─────────────────────────────────────────────────────────────
// 注文
// ─────────────────────────────────────────────────────────────

function toRequest(row: Record<string, unknown>): OrderRequest {
  return {
    id: Number(row.id),
    guestClerkId: String(row.guest_clerk_id),
    guestLabel: String(row.guest_label),
    breweryId: String(row.brewery_id),
    itemId: String(row.item_id),
    brand: String(row.brand),
    cups: Number(row.cups),
    ticketCost: Number(row.ticket_cost),
    status: row.status as RequestStatus,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

/** 当日分の注文をすべて返す。会場の全画面がこの 1 本を共有して見る。 */
export async function listRequests(): Promise<OrderRequest[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, guest_clerk_id, guest_label, brewery_id, item_id, brand,
           cups, ticket_cost, status, created_at, updated_at
    FROM requests
    ORDER BY created_at DESC
    LIMIT 2000
  `) as Record<string, unknown>[];
  return rows.map(toRequest);
}

/**
 * 注文を作る。
 *
 * 中身は Postgres の関数 place_order に置いている（schema.ts 参照）。
 * 「残りを確かめて、チケットを引いて、注文を作る」を途中で割り込まれないよう
 * 行ロックの中で順に実行する必要があり、それは 1 本の SQL では書けなかった。
 *
 * 開始前かどうかだけは、全員に共通の条件なのでここで先に確かめる。
 */
export async function createRequest(input: {
  clerkUserId: string;
  itemId: string;
  cups: number;
}): Promise<Result<{ id: number; spent: number }>> {
  const { MAX_CUPS_PER_REQUEST } = await import('./domain');
  if (input.cups < 1 || input.cups > MAX_CUPS_PER_REQUEST) {
    return fail(`一度に頼めるのは 1〜${MAX_CUPS_PER_REQUEST} 杯です。`);
  }

  const event = await getEvent();
  const { orderingStatus } = await import('./domain');
  const status = orderingStatus(event);
  if (!status.open) {
    return fail(
      status.manual
        ? 'いま主催者が受付を停止しています。'
        : status.label === '終了'
          ? 'イベントは終了しました。'
          : `${event.startTime} の開始までリクエストは送れません。`,
    );
  }

  const sql = await db();
  const rows = (await sql`
    SELECT ok, reason, request_id, spent
    FROM place_order(${input.clerkUserId}, ${input.itemId}, ${input.cups})
  `) as { ok: boolean; reason: string | null; request_id: number | null; spent: number | null }[];

  const row = rows[0];
  if (!row) return fail('注文できませんでした。もう一度お試しください。');
  if (!row.ok) return fail(row.reason ?? '注文できませんでした。もう一度お試しください。');

  return ok({ id: Number(row.request_id), spent: Number(row.spent) });
}

/**
 * 蔵が注文の状態を進める。
 *
 * - delivered にしたときだけ在庫（used_cups）を増やす
 * - cancelled にしたらチケットを参加者に戻す
 *
 * どちらも「状態を進められたら」を条件にした 1 本の SQL の中で行う。
 * 先頭の CTE が 0 行なら後ろの UPDATE も対象が無くなるので、
 * 2 人が同時にボタンを押しても数字は 1 回しか動かない。
 */
export async function setRequestStatus(
  requestId: number,
  to: RequestStatus,
  guard: { breweryId?: string } = {},
): Promise<Result> {
  const { canTransition, STATUS_LABEL } = await import('./domain');
  const sql = await db();

  const currentRows = (await sql`
    SELECT status, brewery_id FROM requests WHERE id = ${requestId}
  `) as { status: RequestStatus; brewery_id: string }[];
  if (currentRows.length === 0) return fail('その注文は見つかりませんでした。');

  const current = currentRows[0];
  if (guard.breweryId && current.brewery_id !== guard.breweryId) {
    return fail('ほかの蔵の注文は操作できません。');
  }
  if (!canTransition(current.status, to)) {
    return fail(
      `「${STATUS_LABEL[current.status]}」から「${STATUS_LABEL[to]}」へは変更できません。`,
    );
  }

  const raced = 'ほかの端末が先に更新しました。画面を更新してください。';

  if (to === 'delivered') {
    // ready → delivered に進められた場合だけ在庫を減らす。
    const rows = (await sql`
      WITH moved AS (
        UPDATE requests SET status = 'delivered', updated_at = now()
        WHERE id = ${requestId} AND status = 'ready'
        RETURNING item_id, cups
      )
      UPDATE items
      SET used_cups = used_cups + (SELECT cups FROM moved)
      WHERE id = (SELECT item_id FROM moved)
      RETURNING id
    `) as { id: string }[];
    return rows.length > 0 ? ok(undefined) : fail(raced);
  }

  if (to === 'cancelled') {
    // 取り消せた場合だけチケットを戻す。二重返却は起きない。
    const rows = (await sql`
      WITH moved AS (
        UPDATE requests SET status = 'cancelled', updated_at = now()
        WHERE id = ${requestId} AND status IN ('accepted', 'preparing', 'ready')
        RETURNING guest_clerk_id, ticket_cost
      )
      UPDATE guests
      SET tickets = tickets + (SELECT ticket_cost FROM moved),
          used    = GREATEST(0, used - (SELECT ticket_cost FROM moved))
      WHERE clerk_user_id = (SELECT guest_clerk_id FROM moved)
      RETURNING clerk_user_id
    `) as { clerk_user_id: string }[];
    return rows.length > 0 ? ok(undefined) : fail(raced);
  }

  // preparing / ready は数字を動かさないので、状態だけ進める。
  const rows = (await sql`
    UPDATE requests SET status = ${to}, updated_at = now()
    WHERE id = ${requestId} AND status = ${current.status}
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0 ? ok(undefined) : fail(raced);
}

// ─────────────────────────────────────────────────────────────
// 問い合わせ
// ─────────────────────────────────────────────────────────────

function toInquiry(row: Record<string, unknown>): Inquiry {
  return {
    id: Number(row.id),
    fromRole: row.from_role as 'brewery' | 'guest',
    fromLabel: String(row.from_label),
    subject: String(row.subject ?? ''),
    body: String(row.body),
    answer: row.answer === null || row.answer === undefined ? null : String(row.answer),
    answeredAt: row.answered_at ? new Date(row.answered_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function createInquiry(input: {
  clerkUserId: string;
  role: 'brewery' | 'guest';
  label: string;
  breweryId?: string;
  subject: string;
  body: string;
}): Promise<Result<{ id: number }>> {
  const { MAX_INQUIRY_BODY, MAX_INQUIRY_SUBJECT, countChars } = await import('./domain');

  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!body) return fail('お問い合わせの内容を入れてください。');
  if (countChars(body) > MAX_INQUIRY_BODY) {
    return fail(`内容は ${MAX_INQUIRY_BODY} 文字までです。`);
  }
  if (countChars(subject) > MAX_INQUIRY_SUBJECT) {
    return fail(`件名は ${MAX_INQUIRY_SUBJECT} 文字までです。`);
  }

  const sql = await db();
  const rows = (await sql`
    INSERT INTO inquiries (from_clerk_id, from_role, from_label, brewery_id, subject, body)
    VALUES (${input.clerkUserId}, ${input.role}, ${input.label},
            ${input.breweryId ?? null}, ${subject}, ${body})
    RETURNING id
  `) as { id: number }[];

  return ok({ id: Number(rows[0].id) });
}

/** 主催者が見る一覧。未回答を先に、新しい順。 */
export async function listInquiries(limit = 200): Promise<Inquiry[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, from_role, from_label, subject, body, answer, answered_at, created_at
    FROM inquiries
    ORDER BY (answer IS NULL) DESC, created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map(toInquiry);
}

/** 自分が出した問い合わせ。返事が来ているかを見るために使う。 */
export async function listMyInquiries(clerkUserId: string, limit = 50): Promise<Inquiry[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT id, from_role, from_label, subject, body, answer, answered_at, created_at
    FROM inquiries
    WHERE from_clerk_id = ${clerkUserId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map(toInquiry);
}

/** まだ返事をしていない件数。主催者のタブに出す。 */
export async function countOpenInquiries(): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    SELECT count(*)::int AS n FROM inquiries WHERE answer IS NULL
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

/**
 * 主催者が返事をする。
 * 一問一答なので、返事は 1 件につき 1 つ。書き直しはできる。
 */
export async function answerInquiry(id: number, answer: string): Promise<Result> {
  const { MAX_INQUIRY_BODY, countChars } = await import('./domain');
  const text = answer.trim();

  if (!text) return fail('返事の内容を入れてください。');
  if (countChars(text) > MAX_INQUIRY_BODY) {
    return fail(`返事は ${MAX_INQUIRY_BODY} 文字までです。`);
  }

  const sql = await db();
  const rows = (await sql`
    UPDATE inquiries SET answer = ${text}, answered_at = now()
    WHERE id = ${id}
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0 ? ok(undefined) : fail('その問い合わせは見つかりませんでした。');
}

// ─────────────────────────────────────────────────────────────
// 会場の現在値をまとめて 1 回で返す（画面が数秒ごとに取りに来る）
// ─────────────────────────────────────────────────────────────

export interface Snapshot {
  event: EventSettings;
  breweries: Brewery[];
  requests: OrderRequest[];
  batches: TicketBatch[];
  guest: Guest | null;
  /** まだ返事をしていない問い合わせの件数。 */
  openInquiries: number;
  serverTime: string;
}

export async function getSnapshot(clerkUserId?: string): Promise<Snapshot> {
  const [event, breweries, requests, batches, openInquiries] = await Promise.all([
    getEvent(),
    listBreweries(),
    listRequests(),
    listTicketBatches(),
    countOpenInquiries(),
  ]);
  return {
    event,
    breweries,
    requests,
    batches,
    guest: clerkUserId ? await getOrCreateGuest(clerkUserId) : null,
    openInquiries,
    serverTime: new Date().toISOString(),
  };
}
