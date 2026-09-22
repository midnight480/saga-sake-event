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

/**
 * 誰の設定か。蔵（新しいリクエスト、#51）と参加者（できあがり、#58）で分けて覚える。
 * 同じ端末で両方を使うことはまず無いが、意味の違う設定を 1 つにまとめない。
 */
export type AlertScope = 'brewery' | 'guest';

const KEYS: Record<AlertScope, string> = {
  brewery: 'saga-sake-event:brewery-alert',
  guest: 'saga-sake-event:guest-alert',
};
const DEFAULTS: AlertPrefs = { sound: true, vibrate: true, keepAwake: false };

const current: Record<AlertScope, AlertPrefs> = { brewery: DEFAULTS, guest: DEFAULTS };
const loaded: Record<AlertScope, boolean> = { brewery: false, guest: false };
const listeners = new Set<() => void>();

function load(scope: AlertScope): AlertPrefs {
  if (loaded[scope]) return current[scope];
  loaded[scope] = true;
  try {
    const raw = window.localStorage.getItem(KEYS[scope]);
    if (raw) current[scope] = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AlertPrefs>) };
  } catch {
    // 読めなくても既定値で動く。
  }
  return current[scope];
}

export function setAlertPrefs(patch: Partial<AlertPrefs>, scope: AlertScope = 'brewery'): void {
  current[scope] = { ...load(scope), ...patch };
  try {
    window.localStorage.setItem(KEYS[scope], JSON.stringify(current[scope]));
  } catch {
    // 覚えられなくても、この画面を開いている間は効く。
  }
  listeners.forEach((fn) => fn());
}

/** 設定を読む。設定欄と、画面全体の知らせる係で同じものを見る。 */
export function useAlertPrefs(scope: AlertScope = 'brewery'): AlertPrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (typeof window === 'undefined' ? DEFAULTS : load(scope)),
    () => DEFAULTS,
  );
}

// 音と振動は sound.ts に置いた（参加者の画面・券の読み取りでも使うため）。
// これまでの呼び出し元が変わらないよう、ここからも渡す。
export { canVibrate, playChime, soundReady, unlockSound, vibrate } from './sound';

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
