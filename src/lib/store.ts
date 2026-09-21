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
  MAX_ITEM_DESCRIPTION,
  SAKE_RICHNESS,
  SAKE_SWEETNESS,
  countChars,
  type SakeRichness,
  type SakeSweetness,
  type BottleSize,
  type Brewery,
  type EventPhase,
  type EventSettings,
  type GuestKind,
  type Guest,
  type Item,
  type Notice,
  type NoticeKind,
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
      i.cups_per_bottle, i.bottles, i.used_cups, i.ticket_cost, i.description,
      i.richness, i.sweetness,
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
        description: String(row.description ?? ''),
        richness: pickOne(SAKE_RICHNESS, row.richness),
        sweetness: pickOne(SAKE_SWEETNESS, row.sweetness),
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

/**
 * 次の蔵 ID（kura-001, kura-002 …）。欠番は埋めず、常に最大値 +1。
 *
 * ★ 数字の取り出しに \D を使ってはいけない ★
 * JavaScript のテンプレートリテラルでは \D がただの D になるため、
 * SQL に渡るのは regexp_replace(login_id, 'D', '', 'g') になってしまう。
 * 数字以外が消えず、'kura-001' を整数に変換しようとして落ちる。
 * 1 蔵目は対象の行が無いので通り、2 蔵目で必ず失敗していた。
 * バックスラッシュを含まない [^0-9] で書く。
 */
async function nextLoginId(): Promise<string> {
  const sql = await db();
  const rows = (await sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(login_id, '[^0-9]', '', 'g'), '')::int), 0) AS n
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
  input: {
    name: string;
    kind: string;
    polish: number;
    size: BottleSize;
    ticketCost: number;
    description?: string;
    richness?: string;
    sweetness?: string;
  },
): Promise<Result<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return fail('銘柄名を入力してください。');
  const { MAX_TICKET_COST } = await import('./domain');
  if (input.ticketCost < 1 || input.ticketCost > MAX_TICKET_COST) {
    return fail(`ポイントは 1〜${MAX_TICKET_COST} です。`);
  }
  const profile = normalizeProfile(input);
  if (!profile.ok) return profile;
  const { description, richness, sweetness } = profile.value;

  const sql = await db();
  const id = `item_${randomInt(1e9).toString(36)}${Date.now().toString(36)}`;
  const cupsPerBottle = CUPS_PER_BOTTLE[input.size] ?? 6;

  await sql`
    INSERT INTO items (id, brewery_id, name, kind, polish, size, cups_per_bottle, ticket_cost,
                       description, richness, sweetness)
    VALUES (${id}, ${breweryId}, ${name}, ${input.kind},
            ${Math.max(0, Math.min(100, Math.round(input.polish)))},
            ${input.size}, ${cupsPerBottle}, ${input.ticketCost},
            ${description}, ${richness}, ${sweetness})
  `;
  return ok({ id });
}

/** 決まった候補の中の 1 つか、空。候補に無い値は空として扱う。 */
function pickOne<T extends string>(choices: readonly T[], value: unknown): T | '' {
  return choices.includes(value as T) ? (value as T) : '';
}

/**
 * 銘柄の説明と味わいの型を整える（Issue #40）。どれも任意なので空でよい。
 *
 * 説明は前後の空白と、3 行以上続く空行を詰める。スマホの小さなカードで、
 * 空白だけで場所を取らないように。長さは見た目どおりの文字数で数える。
 * 味わいの型は候補（淡麗・濃醇 / 大甘口〜大辛口）のどれかか空。
 */
function normalizeProfile(input: {
  description?: string;
  richness?: string;
  sweetness?: string;
}): Result<{ description: string; richness: SakeRichness | ''; sweetness: SakeSweetness | '' }> {
  const description = (input.description ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const length = countChars(description);
  if (length > MAX_ITEM_DESCRIPTION) {
    return fail(`説明は ${MAX_ITEM_DESCRIPTION} 文字までです（いま ${length} 文字）。`);
  }
  const richness = pickOne(SAKE_RICHNESS, input.richness ?? '');
  if (input.richness && !richness) return fail('濃淡は「淡麗」か「濃醇」から選んでください。');
  const sweetness = pickOne(SAKE_SWEETNESS, input.sweetness ?? '');
  if (input.sweetness && !sweetness) return fail('甘辛は候補の中から選んでください。');
  return ok({ description, richness, sweetness });
}

/**
 * 登録したあとで、説明と味わいの型を書き直す。
 * 誤字を直すために、銘柄を消して作り直させない（本数や注文が消えてしまう）。
 */
export async function setItemProfile(
  itemId: string,
  input: { description?: string; richness?: string; sweetness?: string },
): Promise<Result> {
  const profile = normalizeProfile(input);
  if (!profile.ok) return profile;
  const { description, richness, sweetness } = profile.value;

  const sql = await db();
  const rows = (await sql`
    UPDATE items SET description = ${description}, richness = ${richness}, sweetness = ${sweetness}
    WHERE id = ${itemId}
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0 ? ok(undefined) : fail('その銘柄は見つかりませんでした。');
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

/** まだ読み取られていない券だけを取り消す。刷りすぎたときの手当て。 */
export async function discardTickets(batchId: string): Promise<Result<number>> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM tickets
    WHERE batch_id = ${batchId} AND redeemed_by IS NULL
    RETURNING code
  `) as { code: string }[];
  return ok(rows.length);
}

/**
 * 読み取り済みも含めて、その券種の券をすべて消す。
 *
 * 次のイベントを始めるときに使う。前回のイベントで配った券が残っていると、
 * 1 枚あたりのポイントを変えられないため。
 *
 * 参加者がすでに受け取ったポイントは戻さない。戻すと、もう飲んだぶんまで
 * 取り上げることになる。前回の参加者の残高を 0 にしたい場合は、それは
 * 別の操作として分けている。
 */
export async function discardAllTickets(
  batchId: string,
): Promise<Result<{ removed: number; redeemed: number }>> {
  const sql = await db();
  const rows = (await sql`
    DELETE FROM tickets WHERE batch_id = ${batchId}
    RETURNING (redeemed_by IS NOT NULL) AS was_redeemed
  `) as { was_redeemed: boolean }[];

  return ok({
    removed: rows.length,
    redeemed: rows.filter((r) => r.was_redeemed).length,
  });
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
// 次のイベントのための片付け
// ─────────────────────────────────────────────────────────────

export interface ResetCounts {
  requests: number;
  items: number;
  tickets: number;
  guests: number;
  inquiries: number;
}

/**
 * 前回のイベントの記録を片付ける。
 *
 * 残すもの: 酒蔵のアカウント（名前・蔵ID・ログイン）、主催者、
 *           券種ごとのポイント設定、お知らせの宛先
 * 消すもの: 注文、銘柄、券、参加者の残高、問い合わせ、送信済みの節目
 *
 * 酒蔵を残すのは、毎年だいたい同じ蔵が出るのと、アカウントを作り直すと
 * ID とパスワードを配り直すことになるため。銘柄は毎年変わるので消す。
 * どのみち開場前に持ち込み登録をしてもらう運用になっている。
 *
 * すべて 1 つのトランザクションで行う。途中で切れて「注文だけ消えて券は
 * 残っている」のような、どっちつかずの状態を作らないため。
 */
export async function resetEvent(): Promise<Result<ResetCounts>> {
  const sql = await db();

  const [requests, items, tickets, guests, inquiries] = await sql.transaction((txn) => [
    // 参照している側から先に消す。
    txn.query('DELETE FROM requests RETURNING id'),
    txn.query('DELETE FROM items RETURNING id'),
    txn.query('DELETE FROM tickets RETURNING code'),
    txn.query('DELETE FROM guests RETURNING clerk_user_id'),
    txn.query('DELETE FROM inquiries RETURNING id'),
    // 節目のお知らせは、次のイベントで改めて送れるようにする。
    txn.query('DELETE FROM sent_notices'),
    // 🔔 の履歴も前回の分は要らない。読んだ記録は外部キーで一緒に消える。
    txn.query('DELETE FROM notices'),
    // 参加者番号を振り直す。次のイベントで #10001 から始まるようにする。
    txn.query('ALTER SEQUENCE guest_no_seq RESTART WITH 10001'),
    // 受付は「予定どおり」に戻す。手で開けたままにして忘れると危ない。
    txn.query("UPDATE events SET phase = 'auto' WHERE id = 1"),
  ]);

  return ok({
    requests: (requests as unknown[]).length,
    items: (items as unknown[]).length,
    tickets: (tickets as unknown[]).length,
    guests: (guests as unknown[]).length,
    inquiries: (inquiries as unknown[]).length,
  });
}

// ─────────────────────────────────────────────────────────────
// 予行演習用のデータ投入
// ─────────────────────────────────────────────────────────────

/**
 * 蔵に銘柄をまとめて入れる。
 *
 * 通常の登録と同じ列を埋める。予行演習でも本番と同じ形にしておかないと、
 * 画面の見え方を確かめる意味が無い。
 */
export async function seedItems(
  breweryId: string,
  items: {
    name: string;
    kind: string;
    polish: number;
    size: BottleSize;
    ticketCost: number;
    bottles: number;
    poured: number;
  }[],
): Promise<string[]> {
  const sql = await db();
  const ids: string[] = [];

  for (const item of items) {
    const id = `item_${randomInt(1e9).toString(36)}${Date.now().toString(36)}`;
    const cupsPerBottle = CUPS_PER_BOTTLE[item.size] ?? 6;
    // 出した杯数が持ち込みを超えないようにする。
    const poured = Math.min(item.poured, item.bottles * cupsPerBottle);

    await sql`
      INSERT INTO items
        (id, brewery_id, name, kind, polish, size, cups_per_bottle, bottles, used_cups, ticket_cost)
      VALUES (${id}, ${breweryId}, ${item.name}, ${item.kind}, ${item.polish}, ${item.size},
              ${cupsPerBottle}, ${item.bottles}, ${poured}, ${item.ticketCost})
    `;
    ids.push(id);
  }
  return ids;
}

/** 予行演習用の参加者。Clerk のアカウントは作らない。 */
export async function seedGuest(
  clerkUserId: string,
  displayNo: string,
  points: number,
): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO guests (clerk_user_id, display_no, tickets, used)
    VALUES (${clerkUserId}, ${displayNo}, ${points}, 0)
    ON CONFLICT (clerk_user_id) DO UPDATE SET display_no = EXCLUDED.display_no,
                                              tickets = EXCLUDED.tickets,
                                              used = 0
  `;
}

/**
 * 予行演習用の注文。
 *
 * 受けた時刻をずらして入れる。全部「いま」にすると、蔵の画面で「◯分前」が
 * 全部 0 分になり、応答遅延の警告も出ない。
 */
export async function seedRequest(input: {
  guestClerkId: string;
  guestLabel: string;
  breweryId: string;
  itemId: string;
  brand: string;
  cups: number;
  ticketCost: number;
  status: RequestStatus;
  minutesAgo: number;
}): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO requests
      (guest_clerk_id, guest_label, brewery_id, item_id, brand, cups, ticket_cost,
       status, created_at, updated_at)
    VALUES (${input.guestClerkId}, ${input.guestLabel}, ${input.breweryId}, ${input.itemId},
            ${input.brand}, ${input.cups}, ${input.ticketCost}, ${input.status},
            now() - make_interval(mins => ${input.minutesAgo}),
            now() - make_interval(mins => ${input.minutesAgo}))
  `;
  // 使ったポイントを参加者側にも反映する。画面の残高と注文が食い違わないように。
  await sql`
    UPDATE guests SET tickets = GREATEST(0, tickets - ${input.ticketCost}),
                      used = used + ${input.ticketCost}
    WHERE clerk_user_id = ${input.guestClerkId}
  `;
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
  /** 見ている本人の、まだ読んでいないお知らせの件数（右上の 🔔）。 */
  unreadNotices: number;
  serverTime: string;
}

/**
 * @param guestUserId 参加者として見ているときだけ渡す。残高を混ぜて返す。
 * @param viewerUserId ログインしている人なら役割を問わず渡す。🔔 の未読数に使う。
 */
export async function getSnapshot(guestUserId?: string, viewerUserId?: string): Promise<Snapshot> {
  const [event, breweries, requests, batches, openInquiries, unreadNotices] = await Promise.all([
    getEvent(),
    listBreweries(),
    listRequests(),
    listTicketBatches(),
    countOpenInquiries(),
    viewerUserId ? countUnreadNotices(viewerUserId) : Promise.resolve(0),
  ]);
  return {
    event,
    breweries,
    requests,
    batches,
    guest: guestUserId ? await getOrCreateGuest(guestUserId) : null,
    openInquiries,
    unreadNotices,
    serverTime: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// お知らせの履歴（右上の 🔔）
//
// 見えるのは「自分あて」と「全員あて（clerk_user_id が NULL）」。
// 読んだかどうかは notice_reads に人ごとに 1 行。全員あての 1 件でも、
// 読んだ人と読んでいない人がいるので、お知らせ側には持たせない。
// ─────────────────────────────────────────────────────────────

/** まだ読んでいない件数。画面が数秒ごとに取りに来るので、1 本の SQL で数える。 */
export async function countUnreadNotices(clerkUserId: string): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM notices n
    WHERE (n.clerk_user_id = ${clerkUserId} OR n.clerk_user_id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM notice_reads r
        WHERE r.notice_id = n.id AND r.clerk_user_id = ${clerkUserId}
      )
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

/** 新しい順に。多すぎると 🔔 の中が読めなくなるので、直近の分だけ。 */
export async function listNotices(clerkUserId: string, limit = 50): Promise<Notice[]> {
  const sql = await db();
  const rows = (await sql`
    SELECT n.id, n.kind, n.title, n.body, n.url, n.created_at,
           (r.notice_id IS NOT NULL) AS read
    FROM notices n
    LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.clerk_user_id = ${clerkUserId}
    WHERE n.clerk_user_id = ${clerkUserId} OR n.clerk_user_id IS NULL
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ${limit}
  `) as {
    id: number | string;
    kind: NoticeKind;
    title: string;
    body: string;
    url: string;
    created_at: string | Date;
    read: boolean;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    title: r.title,
    body: r.body,
    url: r.url,
    createdAt: new Date(r.created_at).toISOString(),
    read: Boolean(r.read),
  }));
}

/**
 * 1 件を読んだことにする。
 *
 * 見えるお知らせ（自分あて・全員あて）のときだけ記録を作る。ほかの人あての
 * id を渡されても何も起きない。何度呼んでも 1 行のまま（ON CONFLICT）。
 */
export async function markNoticeRead(clerkUserId: string, noticeId: number): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO notice_reads (notice_id, clerk_user_id)
    SELECT n.id, ${clerkUserId}
    FROM notices n
    WHERE n.id = ${noticeId}
      AND (n.clerk_user_id = ${clerkUserId} OR n.clerk_user_id IS NULL)
    ON CONFLICT (notice_id, clerk_user_id) DO NOTHING
  `;
}

/** 見えているものを全部、読んだことにする。新しく既読にした件数を返す。 */
export async function markAllNoticesRead(clerkUserId: string): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    INSERT INTO notice_reads (notice_id, clerk_user_id)
    SELECT n.id, ${clerkUserId}
    FROM notices n
    WHERE n.clerk_user_id = ${clerkUserId} OR n.clerk_user_id IS NULL
    ON CONFLICT (notice_id, clerk_user_id) DO NOTHING
    RETURNING notice_id
  `) as unknown[];
  return rows.length;
}
