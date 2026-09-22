'use client';

import { useEffect, useState, useTransition } from 'react';

import { getPushPublicKey, subscribeToPush, unsubscribeFromPush } from '@/app/actions';
import { pushSupport, registerServiceWorker, urlBase64ToUint8Array } from '@/lib/pwa';

export type PushState =
  | 'loading'
  | 'unsupported'
  | 'need-install'
  | 'ios-too-old'
  | 'off'
  | 'on'
  | 'denied';

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

        const json = subscription.toJSON();
        const saved = await subscribeToPush({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        });
        if (!saved.ok) throw new Error(saved.reason);

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
      setState('off');
    });
  };

  return { state, error, pending, turnOn, turnOff };
}
