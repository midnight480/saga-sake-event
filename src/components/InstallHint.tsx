'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { hideInstallHint, installHintHidden, isInstalled, isIos } from '@/lib/pwa';

/**
 * 初めて開いた人に、ホーム画面への追加をすすめる案内。
 *
 * ★ なぜすすめるのか ★
 * 追加しておくと、ブラウザの余計な枠が消えて画面が広く使えるうえ、
 * iPhone ではこれをしないと お知らせ（通知）を受け取れない。当日の
 * 「まもなく終了します」が届くかどうかが、ここで決まる。
 *
 * 一度きりの案内にしている。毎回出すと邪魔なだけなので、「次回から
 * 表示しない」を選べるようにし、選ばなくても閉じれば同じ扱いにする。
 */
export function InstallHint() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // すでに追加済みの人、前に閉じた人には出さない。
    if (isInstalled() || installHintHidden()) return;
    setIos(isIos());
    // 画面が出そろってから見せる。開いた瞬間に被せると、何の画面か分からない。
    const timer = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;

  const close = () => {
    if (dontShow) hideInstallHint();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:items-center"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ホーム画面に追加する"
        onClick={(e) => e.stopPropagation()}
        className="rise-in flex w-full max-w-[420px] flex-col gap-4 rounded-screen border border-hairline-strong bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-display text-[20px] tracking-[0.04em] text-ink">
          ホーム画面に追加すると便利です
        </h2>

        <div className="flex flex-col gap-2 text-[12.5px] leading-[1.9] text-ink-70">
          <p>
            アプリのように開けて、画面も広く使えます。
            {ios && (
              <>
                <br />
                <strong className="text-gold-bright">
                  iPhone では、追加しないとお知らせ（通知）を受け取れません。
                </strong>
              </>
            )}
          </p>
          <p>「まもなく終了します」などのお知らせが届くようになります。</p>
        </div>

        <ol className="flex flex-col gap-2 rounded-field bg-ink/7 p-3.5 text-[12.5px] leading-[1.8] text-ink/85">
          {ios ? (
            <>
              <li>1. 画面の下にある「共有」（□に↑）を押す</li>
              <li>2. 「ホーム画面に追加」を選ぶ</li>
              <li>3. 右上の「追加」を押す</li>
            </>
          ) : (
            <>
              <li>1. 画面の右上にある「⋮」を押す</li>
              <li>2. 「アプリをインストール」または「ホーム画面に追加」を選ぶ</li>
              <li>3. 「インストール」を押す</li>
            </>
          )}
        </ol>

        <label className="flex items-center gap-2.5 text-[12px] text-ink-55">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="size-5 accent-[#c8a761]"
          />
          この案内を次回から表示しない
        </label>

        <Button tone="go" block onClick={close}>
          閉じる
        </Button>
      </div>
    </div>
  );
}
