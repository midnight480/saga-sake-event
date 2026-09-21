'use client';

import { useEffect, useState, useTransition } from 'react';

import { getPushPublicKey, subscribeToPush, unsubscribeFromPush } from '@/app/actions';
import { Button, Card, Notice } from '@/components/ui';
import { HelpSection, HelpText } from '@/components/Help';
import { MILESTONES } from '@/lib/domain';
import { canUsePush, isInstalled, isIos, registerServiceWorker, urlBase64ToUint8Array } from '@/lib/pwa';

type State = 'loading' | 'unsupported' | 'need-install' | 'off' | 'on' | 'denied';

/** お知らせを受け取る／やめる。ヘルプの中に置く。 */
export function PushSettings() {
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        return;
      }
      // iPhone はホーム画面に追加していないと、許可を出すことすらできない。
      if (isIos() && !isInstalled()) {
        setState('need-install');
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

  return (
    <HelpSection title="お知らせを受け取る">
      <HelpText>次のときに、画面を閉じていてもお知らせが届きます。</HelpText>

      <ul className="flex flex-col gap-1.5 rounded-field bg-ink/7 p-3.5 text-[12px] leading-[1.8] text-ink/85">
        {MILESTONES.map((m) => (
          <li key={m.id}>・{m.title}</li>
        ))}
      </ul>

      {error && <Notice tone="danger">{error}</Notice>}

      {state === 'loading' && <HelpText>確かめています…</HelpText>}

      {state === 'unsupported' && (
        <Notice tone="info">
          このブラウザではお知らせを使えません。Safari か Chrome の新しい版でお試しください。
        </Notice>
      )}

      {state === 'need-install' && (
        <Notice tone="warn" title="先にホーム画面に追加してください">
          iPhone では、ホーム画面に追加したうえで開かないと、お知らせを受け取れません。
          画面下の「共有」→「ホーム画面に追加」から追加して、そのアイコンから開き直してください。
        </Notice>
      )}

      {state === 'denied' && (
        <Notice tone="warn" title="通知が許可されていません">
          端末の設定でこのサイトの通知が拒否されています。ブラウザの設定から許可に変えてください。
        </Notice>
      )}

      {state === 'off' && (
        <Card>
          <Button tone="go" block onClick={turnOn} disabled={pending}>
            {pending ? '設定しています…' : 'お知らせを受け取る'}
          </Button>
        </Card>
      )}

      {state === 'on' && (
        <Card>
          <p className="text-[12.5px] leading-[1.8] text-matcha">この端末で受け取る設定です。</p>
          <Button tone="flat" block onClick={turnOff} disabled={pending}>
            受け取りをやめる
          </Button>
        </Card>
      )}
    </HelpSection>
  );
}
