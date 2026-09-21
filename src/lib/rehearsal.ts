/**
 * 予行演習用のデータ。
 *
 * 当日と同じ形のデータを一度に入れて、画面の見え方と流れを確かめるためのもの。
 * 空の画面をいくら眺めても、混雑の色や在庫のバーがどう出るかは分からない。
 *
 * 実在する佐賀の酒蔵と銘柄を使っている。架空の名前だと、当日の画面を見た
 * ときに「こう出るのか」という感覚が掴めないため。
 */

import type { BottleSize } from './domain';

export interface RehearsalItem {
  name: string;
  kind: string;
  polish: number;
  size: BottleSize;
  /** 1 杯あたりのポイント。 */
  ticketCost: number;
  bottles: number;
  /** すでに何杯 出したことにするか。在庫バーの色を作るために使う。 */
  poured: number;
}

export interface RehearsalBrewery {
  name: string;
  items: RehearsalItem[];
  /** 受付を止めている状態で作るか。黄色の表示を確かめるため 1 蔵だけ止める。 */
  paused?: boolean;
}

export const REHEARSAL_BREWERIES: RehearsalBrewery[] = [
  {
    name: '天山酒造',
    items: [
      { name: '七田 純米', kind: '純米', polish: 65, size: '四合瓶', ticketCost: 2, bottles: 24, poured: 96 },
      { name: '天山 特別純米', kind: '特別純米', polish: 60, size: '一升瓶', ticketCost: 2, bottles: 6, poured: 34 },
      { name: '七田 純米大吟醸', kind: '純米大吟醸', polish: 45, size: '四合瓶', ticketCost: 4, bottles: 10, poured: 12 },
    ],
  },
  {
    name: '富久千代酒造',
    items: [
      { name: '鍋島 純米吟醸', kind: '純米吟醸', polish: 55, size: '四合瓶', ticketCost: 3, bottles: 30, poured: 168 },
      { name: '鍋島 New Moon', kind: '純米大吟醸', polish: 45, size: '四合瓶', ticketCost: 5, bottles: 12, poured: 41 },
      { name: '鍋島 特別本醸造', kind: '本醸造', polish: 70, size: '一升瓶', ticketCost: 1, bottles: 5, poured: 18 },
    ],
  },
  {
    name: '天吹酒造',
    // 受付を止めた状態を 1 蔵だけ作る。ダッシュボードの黄色と、
    // 参加者側の「受付停止中」を確かめるため。
    paused: true,
    items: [
      { name: '天吹 いちご酵母', kind: '純米吟醸', polish: 55, size: '四合瓶', ticketCost: 3, bottles: 20, poured: 52 },
      { name: '天吹 純米', kind: '純米', polish: 65, size: '一升瓶', ticketCost: 2, bottles: 4, poured: 12 },
      { name: '天吹 大吟醸 雄町', kind: '純米大吟醸', polish: 40, size: '四合瓶', ticketCost: 5, bottles: 8, poured: 4 },
    ],
  },
];

/**
 * 予行演習で作る参加者。Clerk のアカウントは作らない（画面の確認用）。
 *
 * 6 人いるのは、1 人が持てる「まだ受け取っていない注文」が 1 件だけだから
 * （Issue #34）。受付済・準備中・準備完了の注文を各蔵に散らすには、
 * それぞれ別の人が頼んでいる必要がある。
 */
export const REHEARSAL_GUESTS = [
  { id: 'rehearsal-guest-1', label: '予行 参加者 A', points: 40 },
  { id: 'rehearsal-guest-2', label: '予行 参加者 B', points: 25 },
  { id: 'rehearsal-guest-3', label: '予行 参加者 C', points: 12 },
  { id: 'rehearsal-guest-4', label: '予行 参加者 D', points: 30 },
  { id: 'rehearsal-guest-5', label: '予行 参加者 E', points: 20 },
  { id: 'rehearsal-guest-6', label: '予行 参加者 F', points: 15 },
] as const;

/**
 * 作る注文の様子。
 *
 * 状態を散らしてある。全部「受付済」だと、蔵の画面でボタンの並びが
 * 1 通りしか見られないし、ダッシュボードの「受渡完了」も 0 のままになる。
 * 1 件だけ、わざと古い時刻にして応答遅延の警告を出す。
 *
 * 1 人の未受取（受付済・準備中・準備完了）は 1 件まで。本番では place_order が
 * それ以上を断るので、予行演習でも同じ形にしておく。受渡完了は何件でもよい。
 */
export const REHEARSAL_ORDERS: {
  brewery: number;
  item: number;
  guest: number;
  cups: number;
  status: 'accepted' | 'preparing' | 'ready' | 'delivered';
  /** 何分前に受けた注文にするか。 */
  minutesAgo: number;
}[] = [
  { brewery: 0, item: 0, guest: 0, cups: 1, status: 'delivered', minutesAgo: 48 },
  { brewery: 0, item: 1, guest: 1, cups: 2, status: 'ready', minutesAgo: 9 },
  { brewery: 0, item: 2, guest: 2, cups: 1, status: 'accepted', minutesAgo: 3 },

  { brewery: 1, item: 0, guest: 1, cups: 1, status: 'delivered', minutesAgo: 35 },
  { brewery: 1, item: 1, guest: 3, cups: 1, status: 'preparing', minutesAgo: 6 },
  // わざと古いままにして、主催者に応答遅延の警告を出す。
  { brewery: 1, item: 2, guest: 4, cups: 1, status: 'accepted', minutesAgo: 17 },

  { brewery: 2, item: 0, guest: 2, cups: 1, status: 'delivered', minutesAgo: 41 },
  { brewery: 2, item: 1, guest: 5, cups: 1, status: 'ready', minutesAgo: 12 },
  { brewery: 2, item: 2, guest: 0, cups: 2, status: 'preparing', minutesAgo: 4 },
];
