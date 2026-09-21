'use client';

/**
 * ホーム画面への追加（PWA）とお知らせまわりの、ブラウザ側の細かい事情。
 *
 * ここに集めているのは、端末ごとの差が大きく、画面のコードに混ぜると
 * 読みにくくなるため。
 */

/** すでにホーム画面から開かれているか。 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS の Safari は標準の仕組みに乗っていないので、独自の印を見る。
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * この端末でお知らせを受け取れるか。
 *
 * iOS は「ホーム画面に追加したあと」でないと受け取れない。ブラウザで開いた
 * ままでは許可を出すことすらできないので、先に追加してもらう必要がある。
 */
export function canUsePush(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (isIos() && !isInstalled()) return false;
  return true;
}

/**
 * 鍵の文字列を、ブラウザが受け取れる形に直す。
 * ArrayBuffer を明示して作る（型の上で SharedArrayBuffer と区別するため）。
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** 常駐スクリプトを用意する。 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

const HIDE_KEY = 'saga-sake-event:hide-install-hint';

/** 「次回から表示しない」を覚えているか。 */
export function installHintHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    // 履歴を残さない設定などで読めないことがある。そのときは出す側に倒す。
    return false;
  }
}

export function hideInstallHint(): void {
  try {
    window.localStorage.setItem(HIDE_KEY, '1');
  } catch {
    // 覚えられなくても動作に支障は無い。
  }
}
