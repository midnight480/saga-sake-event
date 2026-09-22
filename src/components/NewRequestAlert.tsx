'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  keepAwake,
  playChime,
  setAlertPrefs,
  unlockSound,
  useAlertPrefs,
  vibrate,
} from '@/lib/breweryAlert';
import { takeNewRequests, type OrderRequest } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 新しいリクエストが来たことを、蔵の画面で知らせる係（Issue #51）。
 *
 * 蔵の画面ならどのページを開いていても働くよう、外枠（BreweryShell）に置く。
 * 4 秒ごとに届く現在値の中から「まだ見ていない受付済の注文」を探し、
 * 見つけたら 音 → 振動 → 画面の帯 → タブの題名 の全部で知らせる。
 *
 * 開いた時点ですでにある注文では鳴らさない。開き直すたびに鳴ると、
 * どれが新しいのか分からなくなる。
 */
export function NewRequestAlert({ breweryId }: { breweryId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { snapshot } = useSnapshot();
  const prefs = useAlertPrefs();

  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<OrderRequest[]>([]);

  // ── 新しい注文を見つける ──
  useEffect(() => {
    if (!snapshot) return;
    // 最初の 1 回は「すでにあるもの」として覚えるだけ（domain.ts の takeNewRequests）。
    const { seen: next, arrived } = takeNewRequests(seen.current, snapshot.requests, breweryId);
    seen.current = next;
    if (arrived.length === 0) return;

    setFresh((list) => [...arrived, ...list]);
    if (prefs.sound) playChime();
    if (prefs.vibrate) vibrate();
  }, [snapshot, breweryId, prefs.sound, prefs.vibrate]);

  // ── 画面に一度触れたら、音を鳴らせる状態にする ──
  useEffect(() => {
    if (!prefs.sound) return;
    const unlock = () => {
      void unlockSound();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [prefs.sound]);

  // ── 画面を消さない。裏に回ると解除されるので、表に戻るたびに頼み直す ──
  useEffect(() => {
    void keepAwake(prefs.keepAwake);
    if (!prefs.keepAwake) return;
    const again = () => {
      if (document.visibilityState === 'visible') void keepAwake(true);
    };
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      void keepAwake(false);
    };
  }, [prefs.keepAwake]);

  // ── タブの題名に件数を出す。ほかのアプリやタブを見ていても気づけるように ──
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = fresh.length > 0 ? `(${fresh.length}) ${base}` : base;
  }, [fresh.length]);

  // 受付キューを開いたら、見たものとする。
  useEffect(() => {
    if (pathname === '/brewery' && fresh.length > 0) {
      const timer = setTimeout(() => setFresh([]), 4000);
      return () => clearTimeout(timer);
    }
  }, [pathname, fresh.length]);

  if (fresh.length === 0) return null;

  const first = fresh[0];
  const dismiss = () => setFresh([]);

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="rise-in flex w-full max-w-[456px] items-center gap-3 rounded-screen border-2 border-gold bg-card p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        <span aria-hidden className="pulse-dot text-[26px] leading-none">
          🔔
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] leading-snug font-bold text-gold-bright">
            新しいリクエスト {fresh.length} 件
          </span>
          <span className="truncate text-[12px] leading-none text-ink-70">
            「{first.brand}」{first.cups} 杯 ・ {first.guestLabel}
            {fresh.length > 1 ? ` ほか ${fresh.length - 1} 件` : ''}
          </span>
        </div>
        {pathname !== '/brewery' && (
          <button
            type="button"
            onClick={() => {
              dismiss();
              router.push('/brewery');
            }}
            className="min-h-11 flex-none rounded-[9px] bg-terracotta px-3.5 text-[13px] font-bold text-white"
          >
            見る
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="閉じる"
          className="flex size-11 flex-none items-center justify-center rounded-full text-[16px] text-ink-55 hover:bg-ink/7"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** 設定を変えたときに音を鳴らせる状態にし、試しに鳴らす。 */
export async function turnSoundOn(): Promise<boolean> {
  setAlertPrefs({ sound: true });
  const ok = await unlockSound();
  if (ok) playChime();
  return ok;
}
