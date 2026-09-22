'use client';

import { useSyncExternalStore } from 'react';

/**
 * 蔵に新しいリクエストを知らせる手段（Issue #51）。
 *
 * 蔵の担当者は注いだり渡したりで手がふさがっていて、画面を見ていないことが
 * 多い。気づける手段は全部使う: 音・振動・画面の帯・タブの題名・画面を消さない。
 * OS の通知はサーバーから送る（push.ts の sendNewRequestNotice）。
 *
 * どの手段を使うかは端末ごとに覚えておく（localStorage）。同じ蔵でも、
 * 受付に置いた iPad と担当者のスマホで使い分けたいことがあるため。
 * 覚えられない設定（プライベートブラウズなど）でも、その場では効くようにする。
 */

export interface AlertPrefs {
  sound: boolean;
  vibrate: boolean;
  keepAwake: boolean;
}

const KEY = 'saga-sake-event:brewery-alert';
const DEFAULTS: AlertPrefs = { sound: true, vibrate: true, keepAwake: false };

let current: AlertPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): AlertPrefs {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AlertPrefs>) };
  } catch {
    // 読めなくても既定値で動く。
  }
  return current;
}

export function setAlertPrefs(patch: Partial<AlertPrefs>): void {
  current = { ...load(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // 覚えられなくても、この画面を開いている間は効く。
  }
  listeners.forEach((fn) => fn());
}

/** 設定を読む。受付キューの設定欄と、画面全体の知らせる係で同じものを見る。 */
export function useAlertPrefs(): AlertPrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (typeof window === 'undefined' ? DEFAULTS : load()),
    () => DEFAULTS,
  );
}

// ─────────────────────────────────────────────────────────────
// 音
//
// ブラウザは、人が画面に触れる前に音を鳴らさせてくれない。そこで
// ・設定で「音」を押したときに試し音を鳴らす（その 1 回で鳴る状態になる）
// ・画面を開き直したあとは、どこか一度触れた時点で鳴る状態に戻す
// の 2 つで、当日の最初の 1 件から鳴るようにしている。
// iPhone は本体の消音スイッチが入っていると鳴らない（ブラウザからは変えられない）。
// ─────────────────────────────────────────────────────────────

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  return audio;
}

/** 音を鳴らせる状態か。触れる前は false。 */
export function soundReady(): boolean {
  return audio?.state === 'running';
}

/** 人が画面に触れたときに呼ぶ。ここで初めて音を鳴らせる状態になる。 */
export async function unlockSound(): Promise<boolean> {
  const ctx = context();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/**
 * 「ピッ・ポーン」と 2 回鳴らす。
 *
 * 会場はにぎやかなので、高めの音を 2 つ続けて耳に残るようにする。
 * 音源のファイルは持たない（読み込みに失敗して鳴らない、を避けるため）。
 */
export function playChime(): void {
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const tone = (freq: number, start: number, length: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // いきなり鳴らすとプツッと雑音が入るので、音量を滑らかに上げ下げする。
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + length + 0.02);
  };
  tone(988, 0, 0.18); // シ
  tone(1319, 0.2, 0.32); // ミ
}

// ─────────────────────────────────────────────────────────────
// 振動（Android のみ。iPhone のブラウザは振動に対応していない）
// ─────────────────────────────────────────────────────────────

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(): void {
  if (canVibrate()) navigator.vibrate([220, 120, 220]);
}

// ─────────────────────────────────────────────────────────────
// 画面を消さない（Screen Wake Lock）
//
// 受付キューを開いたまま置いておくと、しばらくして画面が消える。消えると
// 帯も見えず、画面側の音も止まることがある。受付の台に置いて使うときのため。
// ─────────────────────────────────────────────────────────────

type WakeLockSentinel = { release: () => Promise<void>; released: boolean };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

export function canKeepAwake(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as WakeLockNavigator).wakeLock;
}

let lock: WakeLockSentinel | null = null;

/**
 * 画面を消さないよう頼む。画面が裏に回ると自動で解除されるので、表に戻る
 * たびに呼び直す（NewRequestAlert で visibilitychange のたびに呼ぶ）。
 */
export async function keepAwake(on: boolean): Promise<void> {
  if (!canKeepAwake()) return;
  if (!on) {
    await lock?.release().catch(() => {});
    lock = null;
    return;
  }
  if (lock && !lock.released) return;
  if (document.visibilityState !== 'visible') return;
  try {
    lock = await (navigator as WakeLockNavigator).wakeLock!.request('screen');
  } catch {
    // 電池の節約モードなどで断られることがある。そのときは諦める。
    lock = null;
  }
}
