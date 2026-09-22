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

/**
 * iPhone / iPad か。
 *
 * iPadOS 13 以降の Safari は、自分を Mac と名乗る（デスクトップ用の表示を
 * 出すため）。そのままでは iPad が漏れるので、タッチ操作ができる「Mac」は
 * iPad とみなす。本物の Mac にタッチ画面は無い。
 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

/**
 * iPhone でどのブラウザを使っているか。
 *
 * iPhone のブラウザは中身がどれも Safari と同じ仕組み（WebKit）で、通知の
 * 条件も同じ。違うのは「共有」ボタンの場所だけなので、案内の文言を変える。
 * LINE や Instagram の中で開いた画面（アプリ内ブラウザ）は、ホーム画面に
 * 追加できない。Safari で開き直してもらう必要がある。
 */
export type IosBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'in-app';

export function iosBrowser(): IosBrowser {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/EdgiOS/i.test(ua)) return 'edge';
  if (/FxiOS/i.test(ua)) return 'firefox';
  // アプリ内ブラウザは UA に Safari を含まないか、アプリ名が入る。
  if (/Line\/|FBAN|FBAV|Instagram|GSA\//i.test(ua) || !/Safari/i.test(ua)) return 'in-app';
  return 'safari';
}

/**
 * この端末で通知を受け取れるか。
 *
 * ★ 確かめる順番が大事 ★
 * iPhone ではブラウザのタブで開いている間、通知の仕組み（PushManager）が
 * そもそも用意されない。先に「仕組みがあるか」を見ると、iPhone では必ず
 * 「このブラウザでは使えません」になり、本当に案内すべき「ホーム画面に
 * 追加してください」にたどり着けない（Issue #50。最新の Chrome でも
 * 「新しい版で試して」と出ていた）。iPhone かどうかを先に見る。
 */
export type PushSupport = 'ok' | 'need-install' | 'ios-too-old' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos()) {
    if (!isInstalled()) return 'need-install';
    // ホーム画面から開いても仕組みが無いなら、iOS が古い（16.4 より前）。
    return hasPush ? 'ok' : 'ios-too-old';
  }
  return hasPush ? 'ok' : 'unsupported';
}

/** 互換のため残す。新しいコードは pushSupport() を使う。 */
export function canUsePush(): boolean {
  return pushSupport() === 'ok';
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
