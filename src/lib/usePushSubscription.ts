'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  getPushPublicKey,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/app/actions';
import { pushSupport, registerServiceWorker, urlBase64ToUint8Array } from '@/lib/pwa';

export type PushState =
  | 'loading'
  | 'unsupported'
  | 'need-install'
  | 'ios-too-old'
  | 'off'
  | 'on'
  | 'denied';

/** 本人が「受け取りをやめる」を押したことを、この端末に覚えておく印。 */
const OFF_KEY = 'saga-sake-event:push-off';

function rememberOff(off: boolean): void {
  try {
    if (off) window.localStorage.setItem(OFF_KEY, '1');
    else window.localStorage.removeItem(OFF_KEY);
  } catch {
    // 覚えられない設定でも動作に支障は無い（そのときは自動で登録し直す側に倒れる）。
  }
}

function turnedOff(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/** 端末の登録を、サーバーに伝える（すでにあれば上書き）。 */
async function saveToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const saved = await subscribeToPush({
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  });
  if (!saved.ok) throw new Error(saved.reason);
}

/**
 * 開くたびに、この端末のお知らせの登録をサーバーと突き合わせる（Issue #76）。
 *
 * 「この端末で受け取る設定です」と出ているのに届かない、が起きていた。端末の側に
 * 登録が残っていても、サーバーの側では次の理由で消えたり、別の人に付いたりする。
 * - 配信サービスが一度「宛先が無い」と返し、サーバーが行を消した
 * - 同じ端末で別のアカウント（蔵と参加者など）に入り直し、登録が後の人に移った
 * - iPhone が端末の側の登録を捨てた（許可は残っている）
 * 許可が出ている端末では、黙って登録し直す。本人が「受け取りをやめる」を押した
 * 端末は除く。許可を求める画面は出さない（出すのはヘルプのボタンを押したときだけ）。
 */
export function usePushResync(): void {
  useEffect(() => {
    (async () => {
      if (pushSupport() !== 'ok') return;
      if (Notification.permission !== 'granted' || turnedOff()) return;
      try {
        const registration = await registerServiceWorker();
        if (!registration) return;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const keyResult = await getPushPublicKey();
          if (!keyResult.ok || !keyResult.value) return;
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyResult.value),
          });
        }
        await saveToServer(subscription);
      } catch (error) {
        // 画面の操作には関係しないので、案内は出さない。ヘルプの欄から設定し直せる。
        console.warn('[push] 登録を確かめられませんでした', error);
      }
    })();
  }, []);
}

/**
 * この端末でお知らせを受け取るかどうか。
 *
 * ヘルプの設定欄（PushSettings）と、注文したあとのマイページの案内
 * （ReadyNoticePrompt）の 2 か所で使う。どちらで押しても同じ登録になる。
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      // iPhone かどうかを先に見る（順番の理由は pwa.ts の pushSupport）。
      const support = pushSupport();
      if (support !== 'ok') {
        setState(support);
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const registration = await registerServiceWorker();
      const existing = await registration?.pushManager.getSubscription();
      setState(existing ? 'on' : 'off');
    })();
  }, []);

  const turnOn = () => {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'denied' : 'off');
          return;
        }

        const registration = await registerServiceWorker();
        if (!registration) throw new Error('常駐スクリプトを用意できませんでした');

        const keyResult = await getPushPublicKey();
        if (!keyResult.ok || !keyResult.value) throw new Error('鍵を取得できませんでした');

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResult.value),
        });

        await saveToServer(subscription);
        rememberOff(false);

        setState('on');
      } catch (e) {
        setError(e instanceof Error ? e.message : '設定できませんでした。');
      }
    });
  };

  const turnOff = () => {
    setError(null);
    startTransition(async () => {
      const registration = await registerServiceWorker();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      rememberOff(true);
      setState('off');
    });
  };

  /** 試しに 1 通送る。届いたかどうかは本人が端末で確かめる。 */
  const [tested, setTested] = useState(false);
  const test = () => {
    setError(null);
    setTested(false);
    startTransition(async () => {
      try {
        const registration = await registerServiceWorker();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) {
          setState('off');
          throw new Error('この端末の登録が見つかりませんでした。「お知らせを受け取る」を押してください。');
        }
        const json = subscription.toJSON();
        const result = await sendTestPush({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        });
        if (!result.ok) throw new Error(result.reason);
        setTested(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : '送れませんでした。');
      }
    });
  };

  return { state, error, pending, turnOn, turnOff, test, tested };
}
