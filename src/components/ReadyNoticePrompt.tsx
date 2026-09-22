'use client';

import { useEffect, useState } from 'react';

import { AddToHomeSteps } from '@/components/AddToHomeSteps';
import { Button, Chip, Notice } from '@/components/ui';
import { setAlertPrefs, useAlertPrefs } from '@/lib/breweryAlert';
import { canVibrate, playChime, unlockSound, vibrate } from '@/lib/sound';
import { usePushSubscription } from '@/lib/usePushSubscription';

/**
 * 注文したあとのマイページに出す、通知の案内（Issue #35）。
 *
 * 設定はヘルプにもあるが、そこまで探しに行く人はいない。受け取りを待って
 * いる「いま」が、通知を入れる理由がいちばん伝わる瞬間なので、ここで聞く。
 * 断られた・使えない端末では何も出さない。しつこく出すと、画面の邪魔になる。
 */
export function ReadyNoticePrompt() {
  return (
    <>
      <SoundToggles />
      <PushPrompt />
    </>
  );
}

/**
 * この画面を開いているときの知らせ方（Issue #58）。音と振動を止めたい人のために。
 * 「音」をオンにすると試し音が鳴り、その場で鳴る状態になる。
 */
function SoundToggles() {
  const prefs = useAlertPrefs('guest');
  const [vibrates, setVibrates] = useState(false);
  useEffect(() => setVibrates(canVibrate()), []);

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
      <span className="text-[11.5px] leading-none text-ink-55">できあがりの知らせ方：</span>
      <Chip
        active={prefs.sound}
        onClick={async () => {
          if (prefs.sound) {
            setAlertPrefs({ sound: false }, 'guest');
            return;
          }
          setAlertPrefs({ sound: true }, 'guest');
          if (await unlockSound()) playChime();
        }}
      >
        {prefs.sound ? '✓ ' : ''}音
      </Chip>
      {vibrates && (
        <Chip
          active={prefs.vibrate}
          onClick={() => {
            setAlertPrefs({ vibrate: !prefs.vibrate }, 'guest');
            if (!prefs.vibrate) vibrate();
          }}
        >
          {prefs.vibrate ? '✓ ' : ''}振動
        </Chip>
      )}
    </div>
  );
}

function PushPrompt() {
  const { state, error, pending, turnOn } = usePushSubscription();

  if (state === 'on') {
    return (
      <p className="px-5 pt-3 text-[11.5px] leading-[1.7] text-matcha">
        できあがったら、この端末に通知でお知らせします。
      </p>
    );
  }

  if (state === 'need-install') {
    return (
      <div className="flex flex-col gap-2 px-5 pt-3">
        <Notice tone="info" title="できあがりを通知で受け取れます">
          iPhone では、ホーム画面に追加して、そのアイコンから開くと通知を受け取れます。
        </Notice>
        <AddToHomeSteps />
      </div>
    );
  }

  if (state !== 'off') return null;

  return (
    <div className="px-5 pt-3">
      <Notice tone="info" title="できあがりを通知で受け取れます">
        スマートフォンをしまっていても、蔵が準備を終えたらお知らせします。
        {error && (
          <>
            <br />
            <span className="text-terracotta-soft">{error}</span>
          </>
        )}
      </Notice>
      <div className="mt-2">
        <Button tone="gold" block onClick={turnOn} disabled={pending}>
          {pending ? '設定しています…' : '通知を受け取る'}
        </Button>
      </div>
    </div>
  );
}
