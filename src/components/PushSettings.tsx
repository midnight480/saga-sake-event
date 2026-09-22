'use client';

import { Button, Card, Notice } from '@/components/ui';
import { AddToHomeSteps } from '@/components/AddToHomeSteps';
import { HelpSection, HelpText } from '@/components/Help';
import { MILESTONES } from '@/lib/domain';
import { usePushSubscription } from '@/lib/usePushSubscription';

/**
 * お知らせを受け取る／やめる。ヘルプの中に置く。
 *
 * extraReasons は、役割ごとに足す「届くとき」。参加者だけは、注文したお酒が
 * できあがったときにも届く（Issue #35）。
 */
export function PushSettings({ extraReasons = [] }: { extraReasons?: string[] }) {
  const { state, error, pending, turnOn, turnOff, test, tested } = usePushSubscription();

  return (
    <HelpSection title="お知らせを受け取る">
      <HelpText>次のときに、画面を閉じていてもお知らせが届きます。</HelpText>

      <ul className="flex flex-col gap-1.5 rounded-field bg-ink/7 p-3.5 text-[12px] leading-[1.8] text-ink/85">
        {extraReasons.map((reason) => (
          <li key={reason}>・{reason}</li>
        ))}
        {MILESTONES.map((m) => (
          <li key={m.id}>・{m.title}</li>
        ))}
      </ul>

      {error && <Notice tone="danger">{error}</Notice>}

      {state === 'loading' && <HelpText>確かめています…</HelpText>}

      {state === 'unsupported' && (
        <Notice tone="info">
          このブラウザではお知らせを受け取れません。Android のスマートフォンなら Chrome で
          開いてください。
        </Notice>
      )}

      {state === 'need-install' && (
        <>
          <Notice tone="warn" title="先にホーム画面に追加してください">
            iPhone では、Safari でも Chrome でも、ホーム画面に追加して
            <strong className="font-bold text-ink">そのアイコンから開いたとき</strong>
            だけ、お知らせを受け取れます。ブラウザが古いわけではありません。
          </Notice>
          <AddToHomeSteps />
          <HelpText>追加したら、ホーム画面のアイコンから開き直して、この欄をもう一度見てください。</HelpText>
        </>
      )}

      {state === 'ios-too-old' && (
        <Notice tone="warn" title="iOS の更新が必要です">
          iPhone でお知らせを受け取るには、iOS 16.4 以降が必要です。「設定」→「一般」→
          「ソフトウェアアップデート」から更新できます。
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
          {/* 届くかどうかを、その場で確かめられるように（Issue #76）。 */}
          <Button tone="ghost" block onClick={test} disabled={pending}>
            {pending ? '送っています…' : '試しに 1 通送る'}
          </Button>
          {tested && (
            <p className="text-[12px] leading-[1.8] text-ink-70">
              送りました。数秒待っても届かないときは、端末の設定でこのアプリ（iPhone はホーム画面の
              アイコン）の通知が許可されているか確かめてください。
            </p>
          )}
          <Button tone="flat" block onClick={turnOff} disabled={pending}>
            受け取りをやめる
          </Button>
        </Card>
      )}
    </HelpSection>
  );
}
