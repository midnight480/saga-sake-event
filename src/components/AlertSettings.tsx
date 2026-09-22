'use client';

import { useEffect, useState } from 'react';

import { AddToHomeSteps } from '@/components/AddToHomeSteps';
import { turnSoundOn } from '@/components/NewRequestAlert';
import { Button, Chip, Notice } from '@/components/ui';
import {
  canKeepAwake,
  canVibrate,
  setAlertPrefs,
  soundReady,
  useAlertPrefs,
  vibrate,
} from '@/lib/breweryAlert';
import { usePushSubscription } from '@/lib/usePushSubscription';

/**
 * リクエストが来たときの知らせ方（Issue #51）。受付キューに置く。
 *
 * 当日の開場前に 1 回だけ触ってもらう場所なので、ふだんは 1 行の要約だけを
 * 出し、「変える」で開く。音はブラウザの決まりで、画面に触れるまで鳴らない。
 * ここで「音」を押すと試し音が鳴り、その場で鳴る状態になる。
 */
export function AlertSettings() {
  const prefs = useAlertPrefs();
  const push = usePushSubscription();
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState({ vibrate: false, keepAwake: false });
  const [soundOk, setSoundOk] = useState(true);

  // 端末ごとにできることが違うので、描画のあとで確かめる。
  useEffect(() => {
    setSupport({ vibrate: canVibrate(), keepAwake: canKeepAwake() });
    setSoundOk(soundReady());
  }, [open]);

  const summary = [
    prefs.sound ? '音' : null,
    prefs.vibrate && support.vibrate ? '振動' : null,
    prefs.keepAwake && support.keepAwake ? '画面をつけたまま' : null,
    push.state === 'on' ? '通知' : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5 rounded-field border border-hairline bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[12px] leading-[1.6] text-ink-70">
          <span className="text-ink-55">新しいリクエストの知らせ方：</span>
          {summary.length > 0 ? summary.join('・') : '画面の帯だけ'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 flex-none px-2 text-[12px] font-bold text-gold underline"
        >
          {open ? 'とじる' : '変える'}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <p className="text-[11.5px] leading-[1.7] text-ink-55">
            画面の帯とタブの題名では、いつでも知らせます。手がふさがっていても気づけるよう、
            ほかの手段も合わせて使ってください。
          </p>

          <div className="flex flex-wrap gap-2">
            <Chip
              active={prefs.sound}
              onClick={async () => {
                if (prefs.sound) setAlertPrefs({ sound: false });
                else setSoundOk(await turnSoundOn());
              }}
            >
              {prefs.sound ? '✓ ' : ''}音
            </Chip>
            {support.vibrate && (
              <Chip
                active={prefs.vibrate}
                onClick={() => {
                  setAlertPrefs({ vibrate: !prefs.vibrate });
                  if (!prefs.vibrate) vibrate();
                }}
              >
                {prefs.vibrate ? '✓ ' : ''}振動
              </Chip>
            )}
            {support.keepAwake && (
              <Chip
                active={prefs.keepAwake}
                onClick={() => setAlertPrefs({ keepAwake: !prefs.keepAwake })}
              >
                {prefs.keepAwake ? '✓ ' : ''}画面をつけたまま
              </Chip>
            )}
          </div>

          {prefs.sound && !soundOk && (
            <Notice tone="warn">
              ブラウザの決まりで、画面に一度触れるまで音は鳴りません。上の「音」を押し直すと
              試し音が鳴り、鳴る状態になります。
            </Notice>
          )}
          <p className="text-[11px] leading-[1.7] text-ink-45">
            iPhone は、本体の消音スイッチが入っていると音が鳴りません。振動はブラウザから使えないため、
            iPhone ではここに出ません。
          </p>

          {/* OS の通知。スマホをしまっていても届く。 */}
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="text-[12px] font-bold text-ink">スマホの通知</span>
            {push.state === 'on' && (
              <p className="text-[12px] leading-[1.7] text-matcha">
                この端末に届きます。画面を閉じていても気づけます。
              </p>
            )}
            {push.state === 'off' && (
              <Button tone="gold" block onClick={push.turnOn} disabled={push.pending}>
                {push.pending ? '設定しています…' : 'この端末で通知を受け取る'}
              </Button>
            )}
            {push.state === 'need-install' && (
              <>
                <p className="text-[12px] leading-[1.7] text-ink-70">
                  iPhone では、ホーム画面に追加して、そのアイコンから開くと通知を受け取れます。
                </p>
                <AddToHomeSteps />
              </>
            )}
            {push.state === 'denied' && (
              <p className="text-[12px] leading-[1.7] text-amber">
                この端末では通知が拒否されています。ブラウザの設定から許可に変えてください。
              </p>
            )}
            {push.state === 'ios-too-old' && (
              <p className="text-[12px] leading-[1.7] text-amber">
                iPhone で通知を受け取るには、iOS 16.4 以降が必要です。
              </p>
            )}
            {push.state === 'unsupported' && (
              <p className="text-[12px] leading-[1.7] text-ink-55">
                このブラウザでは通知を受け取れません。
              </p>
            )}
            {push.error && <Notice tone="danger">{push.error}</Notice>}
          </div>
        </div>
      )}
    </div>
  );
}
