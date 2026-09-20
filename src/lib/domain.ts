/**
 * ドメインの型と計算式。
 *
 * ここは DB もネットワークも触らない純粋な関数だけを置く。サーバーとブラウザの
 * 両方から同じ式で同じ数字が出ることを保証したいので、杯数・チケット・混雑の
 * 判定はすべてこのファイルに集める。画面側で足し算をしないこと。
 */

// ─────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────

/** 注文の状態。この 5 つ以外は存在しない。 */
export type RequestStatus =
  | 'accepted' // 受付済 — 蔵がまだ何もしていない
  | 'preparing' // 準備中 — 注いでいる
  | 'ready' // 準備完了 受取可
  | 'delivered' // 受渡完了 — ここで初めて在庫が減る
  | 'cancelled'; // キャンセル — チケットは参加者に戻る

export type EventPhase =
  | 'before' // 開始前 — 参加者はリクエストを送れない
  | 'open' // 開催中
  | 'closed'; // 終了

export type GuestKind = '一般参加' | '酒蔵特別枠';

/** 瓶のサイズ。1 本から取れる杯数が決まる。 */
export type BottleSize = '四合瓶' | '一升瓶';

export const CUPS_PER_BOTTLE: Record<BottleSize, number> = {
  四合瓶: 6,
  一升瓶: 15,
};

export interface EventSettings {
  name: string;
  eventDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  phase: EventPhase;
  targetBreweryCount: number;
}

export interface Item {
  id: string;
  breweryId: string;
  name: string;
  kind: string; // 純米大吟醸 など
  polish: number; // 精米歩合 0-100
  size: BottleSize;
  cupsPerBottle: number;
  bottles: number;
  usedCups: number; // 渡し終えた杯数
  /** まだ渡し終えていない注文が押さえている杯数。 */
  pendingCups: number;
  ticketCost: number; // 1 杯あたりのチケット枚数 1-3
}

export interface Brewery {
  id: string;
  name: string;
  area: string;
  booth: string;
  accepting: boolean;
  loginId: string; // kura-001
  items: Item[];
}

export interface TicketBatch {
  id: string;
  label: string; // 前売券 10枚
  code: string; // SAGA-ADV
  canAdd: boolean; // 当日券だけ追加発行できる
  cupsPerTicket: number; // 1 枚の QR で何枚分か
  issued: number; // 発行した QR の枚数
  redeemed: number; // 読み取られた枚数
}

export interface Guest {
  clerkUserId: string;
  displayNo: string; // 参加者 #10482
  kind: GuestKind;
  tickets: number; // 残り
  used: number; // 使用済
}

export interface OrderRequest {
  id: number;
  guestClerkId: string;
  guestLabel: string;
  breweryId: string;
  itemId: string;
  brand: string;
  cups: number;
  ticketCost: number; // この注文で使った合計枚数
  status: RequestStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─────────────────────────────────────────────────────────────
// 状態の表示文言
// ─────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<RequestStatus, string> = {
  accepted: '受付済',
  preparing: '準備中',
  ready: '準備完了 受取可',
  delivered: '受渡完了',
  cancelled: 'キャンセル',
};

/** 参加者に見せる一言。蔵側の操作がそのまま参加者の画面の言葉になる。 */
export const STATUS_MESSAGE: Record<RequestStatus, string> = {
  accepted: '蔵が注文を受け取りました。準備の連絡をお待ちください。',
  preparing: 'いま注いでいます。ブース前でお待ちください。',
  ready: 'できあがりました。ブースで受け取ってください。',
  delivered: 'お渡し済みです。ありがとうございました。',
  cancelled: 'この注文は取り消されました。チケットは戻ります。',
};

/** 状態ごとに蔵が押せるボタン。ここが注文の遷移表そのもの。 */
export const STATUS_FLOW: Partial<
  Record<RequestStatus, { to: RequestStatus; label: string; tone: 'go' | 'ok' | 'flat' }[]>
> = {
  accepted: [
    { to: 'preparing', label: '準備中にする', tone: 'go' },
    { to: 'cancelled', label: 'キャンセル', tone: 'flat' },
  ],
  preparing: [
    { to: 'ready', label: '準備完了にする', tone: 'ok' },
    { to: 'cancelled', label: 'キャンセル', tone: 'flat' },
  ],
  ready: [
    { to: 'delivered', label: '受渡完了', tone: 'go' },
    { to: 'cancelled', label: 'キャンセル', tone: 'flat' },
  ],
};

/** その遷移が許されているか。API 側の検証にも使う。 */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (STATUS_FLOW[from] ?? []).some((a) => a.to === to);
}

/** 対応待ち = 蔵がまだ渡し終えていないもの。 */
export const OPEN_STATUSES: RequestStatus[] = ['accepted', 'preparing'];

// ─────────────────────────────────────────────────────────────
// 銘柄の設定候補（持ち込み登録で「種類」を選ぶと自動で入る値）
// ─────────────────────────────────────────────────────────────

export const SAKE_KINDS: { label: string; ticketCost: number; polish: number }[] = [
  { label: '純米大吟醸', ticketCost: 3, polish: 45 },
  { label: '純米吟醸', ticketCost: 2, polish: 55 },
  { label: '特別純米', ticketCost: 1, polish: 60 },
  { label: '純米', ticketCost: 1, polish: 65 },
  { label: '本醸造', ticketCost: 1, polish: 70 },
  { label: 'その他', ticketCost: 1, polish: 60 },
];

/** 佐賀県内の市町。蔵の所在地はこの中から選ぶ。 */
export const SAGA_AREAS = [
  '佐賀市',
  '唐津市',
  '鳥栖市',
  '多久市',
  '伊万里市',
  '武雄市',
  '鹿島市',
  '小城市',
  '嬉野市',
  '神埼市',
  'みやき町',
  '有田町',
  '基山町',
  '白石町',
] as const;

/** ブース番号の並び。主催者が前後に動かす。 */
export const BOOTHS = [
  'A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06', 'A-07', 'A-08',
  'B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-06',
  'C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06',
] as const;

/** 参加区分ごとの初期チケット枚数。 */
export const INITIAL_TICKETS: Record<GuestKind, number> = {
  一般参加: 10,
  酒蔵特別枠: 15,
};

/** 1 杯に使えるチケットの上限（＝一度に頼める杯数の上限）。 */
export const MAX_CUPS_PER_REQUEST = 3;

/** 蔵が応答しないまま何分経ったら主催者に警告を出すか。 */
export const STALE_REQUEST_MINUTES = 12;

// ─────────────────────────────────────────────────────────────
// 杯数の計算
// ─────────────────────────────────────────────────────────────

/** その銘柄が出せる総杯数。本数 × 1 本あたりの杯数。 */
export function itemTotalCups(item: Pick<Item, 'bottles' | 'cupsPerBottle'>): number {
  return item.bottles * item.cupsPerBottle;
}

/**
 * その銘柄の物理的な残り杯数。渡し終えた分だけ減る。
 * 主催者が「会場にまだ酒があるか」を見るための数。
 */
export function itemCupsLeft(item: Pick<Item, 'bottles' | 'cupsPerBottle' | 'usedCups'>): number {
  return Math.max(0, itemTotalCups(item) - item.usedCups);
}

/**
 * いますぐ頼める杯数。物理的な残りから、他の人がすでに注文して
 * まだ受け取っていない分を引いたもの。
 *
 * 参加者に見せる「残り」はこちらを使う。物理的な残りを見せると、
 * 最後の数杯で「残り2杯と書いてあるのに頼めない」が起きる。
 */
export function itemAvailableCups(
  item: Pick<Item, 'bottles' | 'cupsPerBottle' | 'usedCups' | 'pendingCups'>,
): number {
  return Math.max(0, itemTotalCups(item) - item.usedCups - item.pendingCups);
}

export function breweryTotalCups(brewery: Pick<Brewery, 'items'>): number {
  return brewery.items.reduce((sum, i) => sum + itemTotalCups(i), 0);
}

export function breweryCupsLeft(brewery: Pick<Brewery, 'items'>): number {
  return brewery.items.reduce((sum, i) => sum + itemCupsLeft(i), 0);
}

/** 残量の割合 0-100。総数 0 のときは 0。 */
export function remainingPercent(left: number, total: number): number {
  return total > 0 ? Math.round((left / total) * 100) : 0;
}

/** 残量に応じた色。20% 未満は赤、50% 未満は橙。 */
export function stockTone(percent: number): 'low' | 'mid' | 'ok' {
  if (percent < 20) return 'low';
  if (percent < 50) return 'mid';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// 混雑
// ─────────────────────────────────────────────────────────────

export type CrowdLevel = '空いています' | 'やや混雑' | '混雑';

/** 対応待ち件数から混雑の言葉を決める。3 件以上で「混雑」。 */
export function crowdLevel(waitingCount: number): CrowdLevel {
  if (waitingCount >= 3) return '混雑';
  if (waitingCount >= 1) return 'やや混雑';
  return '空いています';
}

/** ある蔵の対応待ち件数。 */
export function waitingCount(requests: OrderRequest[], breweryId: string): number {
  return requests.filter(
    (r) => r.breweryId === breweryId && OPEN_STATUSES.includes(r.status),
  ).length;
}

// ─────────────────────────────────────────────────────────────
// チケット
// ─────────────────────────────────────────────────────────────

/** まだ売れる（読み取られていない）QR の枚数。 */
export function batchForSale(batch: Pick<TicketBatch, 'issued' | 'redeemed'>): number {
  return Math.max(0, batch.issued - batch.redeemed);
}

/**
 * 会場の在庫を「チケット何枚分」に換算した数。
 * 残り杯数 × その銘柄の 1 杯あたり枚数の合計。
 * 券が売り切れているのに在庫が余っている状況を検知するために使う。
 */
export function stockInTickets(breweries: Brewery[]): number {
  return breweries.reduce(
    (sum, b) => sum + b.items.reduce((s, i) => s + itemCupsLeft(i) * i.ticketCost, 0),
    0,
  );
}

/**
 * 「チケットだけが売り切れている」状態か。
 * 当日券が 0 枚なのに会場にはまだ注げる酒がある ＝ 当日券を追加発行すれば
 * 来場者は飲み続けられる、という主催者への提案トリガー。
 */
export function isTicketShortage(sameDayForSale: number, stockTickets: number): boolean {
  return sameDayForSale === 0 && stockTickets > 0;
}

// ─────────────────────────────────────────────────────────────
// 時刻
// ─────────────────────────────────────────────────────────────

/** 'HH:MM' を 0 時からの分数へ。壊れた入力は 0 として扱う。 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':');
  const hours = Number(h);
  const mins = Number(m);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 経過分数。負にはしない。 */
export function minutesSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 60000));
}

/**
 * 参加者がリクエストを送れるか。
 * 開催中でなければ送れない。開催中でも開始時刻前は送れない。
 */
export function isOrderingOpen(event: EventSettings, now: Date = new Date()): boolean {
  if (event.phase !== 'open') return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= timeToMinutes(event.startTime);
}

/** 主催者に出す応答遅延アラート。 */
export function staleAlerts(
  requests: OrderRequest[],
  breweries: Brewery[],
  now: Date = new Date(),
): string[] {
  const nameOf = (id: string) => breweries.find((b) => b.id === id)?.name ?? '不明な蔵';
  return requests
    .filter((r) => r.status === 'accepted' && minutesSince(r.createdAt, now) >= STALE_REQUEST_MINUTES)
    .map((r) => `${nameOf(r.breweryId)} が ${minutesSince(r.createdAt, now)}分 未応答（${r.brand}）`);
}
