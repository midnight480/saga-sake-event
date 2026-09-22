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

/**
 * 受付の開け閉めをどう決めるか。
 *
 * 原則は 'auto'（開始時刻〜終了時刻のあいだだけ受け付ける）。
 * 'open' と 'closed' は、主催者がその場の判断で予定を上書きしたときの状態。
 */
export type EventPhase =
  | 'auto' // 予定どおり（既定）
  | 'open' // 手動で開けている
  | 'closed'; // 手動で閉じている

/**
 * 参加区分。
 * 当日は受付で渡す券の種類でポイントが決まるので、本人が選ぶものではない。
 * 記録として残しているだけで、いまはすべて「一般参加」になる。
 */
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
  /**
   * 蔵が添える説明（任意、Issue #40）。空なら出さない。
   * 初めての人には銘柄名だけではどんなお酒か分からないので、蔵の言葉で補う。
   */
  description: string;
  /** 濃淡（任意）。空なら出さない。 */
  richness: SakeRichness | '';
  /** 甘辛（任意）。空なら出さない。 */
  sweetness: SakeSweetness | '';
  /**
   * この銘柄の注文を受けているか（Issue #43）。蔵全体の受付（Brewery.accepting）
   * とは別に、銘柄ごとに止められる。瓶を開け直している間だけ止める、など。
   */
  accepting: boolean;
}

/**
 * 味わいの型。説明文を読まなくても、どんなお酒か一目で分かるように。
 * 並びは画面に出す順。schema-sql.ts の CHECK と同じ値にしておくこと。
 */
export const SAKE_RICHNESS = ['淡麗', '濃醇'] as const;
export const SAKE_SWEETNESS = ['大甘口', '甘口', '普通', '辛口', '大辛口'] as const;
export type SakeRichness = (typeof SAKE_RICHNESS)[number];
export type SakeSweetness = (typeof SAKE_SWEETNESS)[number];

/** 画面に出す味わいの札。選ばれているものだけ、濃淡 → 甘辛 の順に。 */
export function tasteTags(item: Pick<Item, 'richness' | 'sweetness'>): string[] {
  return [item.richness, item.sweetness].filter((t): t is SakeRichness | SakeSweetness => !!t);
}

export interface Brewery {
  id: string;
  name: string;
  area: string;
  booth: string;
  accepting: boolean;
  loginId: string; // kura-001
  /** ログイン用のアカウントが実際に作られているか。 */
  hasLoginAccount: boolean;
  items: Item[];
}

export interface TicketBatch {
  id: string;
  label: string; // 前売券
  code: string; // SAGA-ADV
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
  /** 蔵が最後に催促した時刻（Issue #73）。していなければ null。 */
  remindedAt: string | null;
}

/**
 * 催促を送れる間隔（秒。Issue #73）。蔵が続けて押しても、参加者のスマホを鳴らし続けないため。
 * サーバー（store.ts の markReminded）と蔵の画面の両方でこの値を使う。
 */
export const REMIND_INTERVAL_SECONDS = 60;

/** いま催促を送れるか。前の催促から REMIND_INTERVAL_SECONDS 経っていれば送れる。 */
export function canRemind(request: OrderRequest, now: Date): boolean {
  if (request.status !== 'ready') return false;
  if (!request.remindedAt) return true;
  return now.getTime() - new Date(request.remindedAt).getTime() >= REMIND_INTERVAL_SECONDS * 1000;
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
  cancelled: 'この注文は取り消されました。ポイントは戻ります。',
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

/**
 * 参加者がまだ受け取っていない注文。
 *
 * OPEN_STATUSES と違って「準備完了 受取可」も含む。蔵から見れば手は離れて
 * いるが、参加者の手元にはまだ届いていないので。
 *
 * これが 1 件でもある参加者は、次の注文を出せない（Issue #34）。受け取りに
 * 来ないまま次々と頼まれると、蔵の前に杯が並んで取り違えが起きるため。
 * place_order（schema-sql.ts）も同じ 3 つを見ている。ずらさないこと。
 */
export const UNDELIVERED_STATUSES: RequestStatus[] = ['accepted', 'preparing', 'ready'];

/** その参加者のまだ受け取っていない注文。無ければ null。 */
export function undeliveredRequestOf(
  requests: OrderRequest[],
  guestClerkId: string,
): OrderRequest | null {
  return (
    requests.find(
      (r) => r.guestClerkId === guestClerkId && UNDELIVERED_STATUSES.includes(r.status),
    ) ?? null
  );
}

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

/**
 * 一度に頼める杯数の上限（Issue #34）。
 * 受け取るまで次を頼めないので、手元に同時に来るのも最大でこの杯数になる。
 */
export const MAX_CUPS_PER_REQUEST = 3;

/**
 * 1 杯あたりに設定できるチケット枚数の上限。
 * 銘柄の値付けは蔵が決めるものなので、こちらで 3 枚までと決め打ちしない。
 */
export const MAX_TICKET_COST = 20;

/**
 * 問い合わせの長さの上限。
 * 文字数は Array.from で数える。日本語 1 文字を 1 文字として扱うため
 * （length だと絵文字などで見た目と合わなくなる）。
 */
export const MAX_INQUIRY_SUBJECT = 100;
export const MAX_INQUIRY_BODY = 300;

/**
 * 銘柄の説明文の長さの上限（Issue #40）。数え方は問い合わせと同じ。
 * スマホの銘柄カードで 4〜5 行に収まる長さ。schema-sql.ts の CHECK と同じ値。
 */
export const MAX_ITEM_DESCRIPTION = 200;

/** 見た目どおりの文字数。 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export interface Inquiry {
  id: number;
  fromRole: 'brewery' | 'guest';
  /** 誰からか（蔵名、または参加者番号）。 */
  fromLabel: string;
  subject: string;
  body: string;
  /** 主催者の返事。まだなら null。 */
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

/**
 * お知らせを出す節目。
 *
 * 会場では画面を見ていないことのほうが多い。節目だけを押さえて、
 * それ以外では鳴らさない。鳴りすぎると切られてしまう。
 */
export type Milestone = 'before-start' | 'start' | 'before-end' | 'end';

export const MILESTONES: {
  id: Milestone;
  /** 開始（または終了）から何分ずらすか。負なら前。 */
  offsetMinutes: number;
  /** どちらの時刻を基準にするか。 */
  from: 'start' | 'end';
  title: string;
  body: string;
}[] = [
  {
    id: 'before-start',
    from: 'start',
    offsetMinutes: -10,
    title: 'まもなく開始します',
    body: 'あと 10 分で受付が始まります。準備をお願いします。',
  },
  {
    id: 'start',
    from: 'start',
    offsetMinutes: 0,
    title: '受付がはじまりました',
    body: 'お酒のリクエストを送れるようになりました。',
  },
  {
    id: 'before-end',
    from: 'end',
    offsetMinutes: -30,
    title: 'まもなく終了します',
    body: 'あと 30 分で受付が終わります。お早めにどうぞ。',
  },
  {
    id: 'end',
    from: 'end',
    offsetMinutes: 0,
    title: '受付が終わりました',
    body: '本日はありがとうございました。受け取り残しがないかご確認ください。',
  },
];

/** その節目が、いつ来るか。 */
export function milestoneAt(event: EventSettings, milestone: Milestone): Date | null {
  const spec = MILESTONES.find((m) => m.id === milestone);
  if (!spec) return null;
  const window = scheduleWindow(event);
  const base = spec.from === 'start' ? window.start : window.end;
  return new Date(base.getTime() + spec.offsetMinutes * 60 * 1000);
}

/**
 * いま送るべき節目。
 *
 * 過ぎたものだけを返す。ただし、あまりに昔のものは返さない。
 * 誰もアプリを開いていなかった時間帯のぶんを、あとからまとめて鳴らすと
 * 意味が無いうえ、驚かせるだけだから。
 */
export function dueMilestones(
  event: EventSettings,
  now: Date = new Date(),
  graceMinutes = 20,
): Milestone[] {
  return MILESTONES.filter((spec) => {
    const at = milestoneAt(event, spec.id);
    if (!at) return false;
    const passed = now.getTime() - at.getTime();
    return passed >= 0 && passed <= graceMinutes * 60 * 1000;
  }).map((spec) => spec.id);
}

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
/**
 * その蔵の待ち件数（受付済・準備中）。
 *
 * 数えるのはサーバー（store.countWaitingByBrewery）。以前は全員の注文を
 * 参加者の端末へ送って画面で数えていたが、それだと誰が何を頼んだかまで
 * 渡ってしまう（Issue #39）。画面には蔵ごとの件数だけが届く。
 */
export function waitingCount(waitingByBrewery: Record<string, number>, breweryId: string): number {
  return waitingByBrewery[breweryId] ?? 0;
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

/**
 * イベントの時刻を解釈するときの時差。
 *
 * ★ サーバーの時計を基準にしてはいけない ★
 * 開催日と時刻は日本時間で入力される。ところが Vercel のサーバーは UTC で
 * 動くので、new Date().getHours() を使うと 9 時間ずれる。11:00 開始のはずが
 * 02:00 で開いてしまう。必ずこの時差を付けて絶対時刻に直す。
 */
export const EVENT_UTC_OFFSET = '+09:00';

/** 開催日・開始時刻・終了時刻から、受付を行う時間帯を絶対時刻で組み立てる。 */
export function scheduleWindow(event: EventSettings): { start: Date; end: Date } {
  const start = new Date(`${event.eventDate}T${event.startTime}:00${EVENT_UTC_OFFSET}`);
  let end = new Date(`${event.eventDate}T${event.endTime}:00${EVENT_UTC_OFFSET}`);
  // 終了が開始以前なら日をまたぐ指定とみなす（23:00〜01:00 など）。
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** 予定の時間帯の中にいるか。 */
export function isWithinSchedule(event: EventSettings, now: Date = new Date()): boolean {
  const { start, end } = scheduleWindow(event);
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

export interface OrderingStatus {
  /** 参加者がリクエストを送れるか。 */
  open: boolean;
  /** 予定ではなく主催者の操作で決まっている状態か。 */
  manual: boolean;
  /** 画面に出す短い言葉。 */
  label: string;
}

/**
 * いま受付をしているか、それはなぜか。
 * 主催者の上書きがあればそれに従い、無ければ予定どおりに判断する。
 */
export function orderingStatus(event: EventSettings, now: Date = new Date()): OrderingStatus {
  if (event.phase === 'open') return { open: true, manual: true, label: '受付中（手動）' };
  if (event.phase === 'closed') return { open: false, manual: true, label: '停止中（手動）' };

  const { start, end } = scheduleWindow(event);
  if (now.getTime() < start.getTime()) return { open: false, manual: false, label: '開始前' };
  if (now.getTime() >= end.getTime()) return { open: false, manual: false, label: '終了' };
  return { open: true, manual: false, label: '受付中' };
}

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

/** 参加者がリクエストを送れるか。 */
export function isOrderingOpen(event: EventSettings, now: Date = new Date()): boolean {
  return orderingStatus(event, now).open;
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

// ─────────────────────────────────────────────────────────────
// 参加者の記録（Issue #30, #32）
// ─────────────────────────────────────────────────────────────

/**
 * 注文の時刻を「9/21 14:32」の形にする。
 *
 * 端末の時計の設定に頼らず、必ず日本時間で出す。海外設定のスマホで開いても、
 * 会場の時計と同じ時刻が並ぶように。
 */
export function formatJstDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '―';
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

/** その参加者の注文を新しい順に。 */
export function requestsOf(requests: OrderRequest[], guestClerkId: string): OrderRequest[] {
  return requests
    .filter((r) => r.guestClerkId === guestClerkId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface ItemConquest {
  item: Item;
  /** 受け取った杯数。0 なら未制覇。 */
  cups: number;
}

export interface BreweryConquest {
  brewery: Brewery;
  items: ItemConquest[];
  /** 1 杯でも受け取った銘柄の数。 */
  conquered: number;
}

export interface Conquest {
  breweries: BreweryConquest[];
  /** 1 杯でも受け取った蔵の数。 */
  breweriesVisited: number;
  itemsConquered: number;
  itemsTotal: number;
  /** 受け取った杯数の合計。 */
  cups: number;
}

/**
 * どの蔵・どの銘柄をどれだけ飲んだか。
 *
 * 数えるのは **受渡完了** だけ。頼んだだけ・準備中のものは、まだ手元に無いので
 * 「制覇」に含めない。キャンセルも含めない。
 * 分母は、いま登録されている銘柄。途中で消された銘柄は分母にも分子にも入らない。
 */
export function conquestOf(
  breweries: Brewery[],
  requests: OrderRequest[],
  guestClerkId: string,
): Conquest {
  const cupsByItem = new Map<string, number>();
  for (const r of requests) {
    if (r.guestClerkId !== guestClerkId || r.status !== 'delivered') continue;
    cupsByItem.set(r.itemId, (cupsByItem.get(r.itemId) ?? 0) + r.cups);
  }

  const list = breweries
    .filter((b) => b.items.length > 0)
    .map((brewery) => {
      const items = brewery.items.map((item) => ({ item, cups: cupsByItem.get(item.id) ?? 0 }));
      return { brewery, items, conquered: items.filter((i) => i.cups > 0).length };
    });

  return {
    breweries: list,
    breweriesVisited: list.filter((b) => b.conquered > 0).length,
    itemsConquered: list.reduce((sum, b) => sum + b.conquered, 0),
    itemsTotal: list.reduce((sum, b) => sum + b.items.length, 0),
    cups: list.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.cups, 0), 0),
  };
}

// ─────────────────────────────────────────────────────────────
// お知らせの履歴（右上の 🔔）
// ─────────────────────────────────────────────────────────────

export type NoticeKind = 'milestone' | 'ready' | 'message' | 'delivered';

/**
 * 主催者からの配信の宛先（Issue #54）。個別の蔵・参加者あては作らない。
 * 並びは画面に出す順。
 */
export const MESSAGE_AUDIENCES = [
  { value: 'brewery', label: '全酒蔵' },
  { value: 'guest', label: '全参加者' },
  { value: 'brewery+guest', label: '酒蔵と参加者の両方' },
] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number]['value'];

/** 配信の件名と本文の長さの上限。数え方は問い合わせと同じ（countChars）。 */
export const MAX_MESSAGE_TITLE = 40;
export const MAX_MESSAGE_BODY = 300;

/** 主催者が送ったお知らせ。配信画面の「送ったもの」に並べる。 */
export interface SentMessage {
  id: number;
  audience: MessageAudience;
  title: string;
  body: string;
  createdAt: string; // ISO
}

/** 配信の確認画面に出す、届く相手の数。 */
export interface MessageRecipients {
  breweries: number;
  guests: number;
  /** そのうち、スマホの通知を受け取る端末の数。 */
  devices: number;
}

/** 🔔 に並ぶ 1 件。 */
export interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  body: string;
  /** 押したときに開く画面。 */
  url: string;
  createdAt: string; // ISO
  read: boolean;
}

// ─────────────────────────────────────────────────────────────
// 蔵に知らせる新しいリクエスト（Issue #51）
// ─────────────────────────────────────────────────────────────

/**
 * 前回までに見ていない「受付済」の注文を返し、見たものとして覚える。
 *
 * seen が null（画面を開いた直後）のときは、いまある注文を覚えるだけで何も返さない。
 * 開き直すたびに鳴ると、どれが新しいのか分からなくなるため。
 * 受付済のものだけを見る。準備中などに進んだものは、もう蔵が手を付けている。
 */
export function takeNewRequests(
  seen: Set<number> | null,
  requests: OrderRequest[],
  breweryId: string,
): { seen: Set<number>; arrived: OrderRequest[] } {
  const accepted = requests.filter((r) => r.breweryId === breweryId && r.status === 'accepted');
  if (seen === null) return { seen: new Set(accepted.map((r) => r.id)), arrived: [] };
  const arrived = accepted.filter((r) => !seen.has(r.id));
  const next = new Set(seen);
  arrived.forEach((r) => next.add(r.id));
  return { seen: next, arrived };
}

// ─────────────────────────────────────────────────────────────
// 称号（Issue #52）
//
// 記録を見るたびに少しずつ上がっていく楽しみを作る。SNS に載せてもらうことも
// 考え、飲む量ではなく「どれだけ多くの銘柄と出会ったか」を称える言葉にした。
// 泥酔・酩酊のような、飲み過ぎを勧める言葉は使わない。
//
// 数えるのは受渡完了だけ（conquestOf と同じ）。頼んだだけでは上がらない。
// ─────────────────────────────────────────────────────────────

export interface Rank {
  name: string;
  /** 読みがな。読みにくい称号だけ。 */
  reading?: string;
  description: string;
}

/**
 * 段の区切りは「受け取った銘柄の数」で決める。
 * 割合にしなかったのは、蔵が 30 あると 1 人で 2 割を飲むのは現実的でなく、
 * ほとんどの人がずっと最初の段のままになるため。
 */
export const RANKS: (Rank & { atLeast: number })[] = [
  { atLeast: 0, name: '素面', reading: 'しらふ', description: 'まだ一杯目の前。最初の一杯をどうぞ。' },
  { atLeast: 1, name: 'ほろ酔い', description: '佐賀の酒に、はじめまして。' },
  { atLeast: 3, name: '一杯機嫌', reading: 'いっぱいきげん', description: '味の違いが分かってきたころ。' },
  { atLeast: 5, name: '上機嫌', description: '蔵めぐりが楽しくなってきた。' },
  { atLeast: 8, name: '酒通', reading: 'さけつう', description: '好みの一本を語れる。' },
  { atLeast: 12, name: '酒豪', description: 'まだまだ出会いを求める、頼もしい飲み手。' },
  { atLeast: 20, name: '酒仙', reading: 'しゅせん', description: '酒を友とする境地。' },
];

/** すべての蔵のすべての銘柄を飲み干したときだけの、いちばん上の称号。 */
export const TOP_RANK: Rank = {
  name: '酒呑童子',
  reading: 'しゅてんどうじ',
  description: 'すべての蔵の、すべての銘柄を飲み干した伝説の酒呑み。',
};

export interface SpecialTitle {
  id: 'kura-master' | 'kura-meguri';
  name: string;
  reading?: string;
  description: string;
  earned: boolean;
  /** 取れていれば、どの蔵で取れたか。取れていなければ、あと何をすればよいか。 */
  detail: string;
}

export interface TitleStatus {
  rank: Rank;
  /** 次の称号と、そこまでの残り銘柄数。いちばん上なら null。 */
  next: { rank: Rank; remaining: number } | null;
  specials: SpecialTitle[];
}

export function titleOf(conquest: Conquest): TitleStatus {
  const { itemsConquered, itemsTotal, breweries } = conquest;
  const complete = itemsTotal > 0 && itemsConquered === itemsTotal;

  // 全銘柄の数以上の区切りは、全部飲むまで届かない。その段は飛ばし、
  // 全部飲んだら酒呑童子にする（途中の段と重なったら、酒呑童子を優先）。
  const reachable = RANKS.filter((r) => r.atLeast === 0 || r.atLeast < itemsTotal);
  const current = [...reachable].reverse().find((r) => itemsConquered >= r.atLeast) ?? RANKS[0];
  const upcoming = reachable.find((r) => r.atLeast > itemsConquered);

  const rank: Rank = complete ? TOP_RANK : current;
  const next = complete
    ? null
    : upcoming
      ? { rank: upcoming, remaining: upcoming.atLeast - itemsConquered }
      : itemsTotal > 0
        ? { rank: TOP_RANK, remaining: itemsTotal - itemsConquered }
        : null;

  // ── 特別な称号。蔵が 1 つも無いときは、どちらも取れない（空の「全部」を満たさない）。──
  const mastered = breweries.filter((b) => b.items.length > 0 && b.conquered === b.items.length);
  const unvisited = breweries.filter((b) => b.conquered === 0);
  const hasBreweries = breweries.length > 0;

  const specials: SpecialTitle[] = [
    {
      id: 'kura-master',
      name: '蔵の主',
      reading: 'くらのぬし',
      description: 'ひとつの蔵の、すべての銘柄を飲んだ。',
      earned: mastered.length > 0,
      detail:
        mastered.length > 0
          ? mastered.map((b) => b.brewery.name).join('、')
          : 'どこか 1 つの蔵で、全部の銘柄を',
    },
    {
      id: 'kura-meguri',
      name: '蔵めぐり名人',
      description: 'すべての蔵で、1 銘柄以上を飲んだ。',
      earned: hasBreweries && unvisited.length === 0,
      detail:
        hasBreweries && unvisited.length === 0
          ? `${breweries.length} 蔵すべて`
          : `あと ${unvisited.length} 蔵`,
    },
  ];

  return { rank, next, specials };
}

// ─────────────────────────────────────────────────────────────
// 参加者に知らせる「できあがり」（Issue #58）
// ─────────────────────────────────────────────────────────────

/**
 * 前回までに知らせていない「準備完了」の自分の注文を返し、知らせたものとして覚える。
 *
 * seen が null（画面を開いた直後）のときも、すでにできあがっているものを返す。
 * 開いた時点で取りに行くべきものがあるなら、それは知らせたほうがよいため。
 * その場合は initial を true にして、音や振動は鳴らさない（開いただけで鳴ると驚く。
 * そもそもブラウザの決まりで、触れる前は音が鳴らない）。
 */
export function takeNewlyReady(
  seen: Set<number> | null,
  requests: OrderRequest[],
  guestClerkId: string,
): { seen: Set<number>; arrived: OrderRequest[]; initial: boolean } {
  const ready = requests.filter((r) => r.guestClerkId === guestClerkId && r.status === 'ready');
  const initial = seen === null;
  const known = seen ?? new Set<number>();
  const arrived = ready.filter((r) => !known.has(r.id));
  const next = new Set(known);
  arrived.forEach((r) => next.add(r.id));
  return { seen: next, arrived, initial };
}

/**
 * 前回までに見ていない「受渡完了」の自分の注文を返す（Issue #66）。
 *
 * 受け取ったら記録の画面へ移し、まだ飲んでいない銘柄が分かるようにする。
 * 画面を開いた直後（seen が null）は、これまでに受け取ったものを覚えるだけで
 * 何も返さない。開き直すたびに記録へ飛ばされると困るため。
 */
export function takeNewlyDelivered(
  seen: Set<number> | null,
  requests: OrderRequest[],
  guestClerkId: string,
): { seen: Set<number>; arrived: OrderRequest[] } {
  const delivered = requests.filter(
    (r) => r.guestClerkId === guestClerkId && r.status === 'delivered',
  );
  if (seen === null) return { seen: new Set(delivered.map((r) => r.id)), arrived: [] };
  const arrived = delivered.filter((r) => !seen.has(r.id));
  const next = new Set(seen);
  arrived.forEach((r) => next.add(r.id));
  return { seen: next, arrived };
}
