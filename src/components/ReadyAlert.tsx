'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAlertPrefs } from '@/lib/breweryAlert';
import { takeNewlyReady, type OrderRequest } from '@/lib/domain';
import { playChime, unlockSound, vibrate } from '@/lib/sound';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 注文したお酒ができあがったことを、参加者の画面で知らせる係（Issue #58）。
 *
 * いつ取りに行っていいのか分からない、を無くす。🔔 への記録とスマホの通知は
 * サーバーが送る（push.ts の sendReadyNotice）。画面を開いているときは、それに加えて
 * 音・振動・画面の下の帯・タブの題名で知らせる。どのページを開いていても出るよう、
 * 参加者の外枠（GuestShell）に置く。
 *
 * 取りに行って受渡完了になったら、帯は自動で消える。
 */
export function ReadyAlert({ guestClerkId }: { guestClerkId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { snapshot } = useSnapshot();
  const prefs = useAlertPrefs('guest');

  const seen = useRef<Set<number> | null>(null);
  const [shown, setShown] = useState<number[]>([]);

  // ── 新しくできあがった注文を見つける ──
  useEffect(() => {
    if (!snapshot) return;
    const { seen: next, arrived, initial } = takeNewlyReady(
      seen.current,
      snapshot.requests,
      guestClerkId,
    );
    seen.current = next;
    if (arrived.length === 0) return;

    setShown((ids) => [...arrived.map((r) => r.id), ...ids]);
    // 開いた時点ですでにできあがっていたものは、帯だけ出して鳴らさない。
    if (!initial) {
      if (prefs.sound) playChime();
      if (prefs.vibrate) vibrate([250, 120, 250, 120, 250, 120, 700]);
    }
  }, [snapshot, guestClerkId, prefs.sound, prefs.vibrate]);

  // ── 画面に一度触れたら、音を鳴らせる状態にする ──
  useEffect(() => {
    if (!prefs.sound) return;
    const unlock = () => void unlockSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [prefs.sound]);

  // いまも「準備完了」のものだけを出す。受け取ったら（受渡完了）、取り消されたら消える。
  const ready: OrderRequest[] = (snapshot?.requests ?? []).filter(
    (r) => shown.includes(r.id) && r.status === 'ready',
  );

  // ── タブの題名にも出す。ほかのアプリやタブを見ていても気づけるように ──
  useEffect(() => {
    const base = document.title.replace(/^【できあがり】\s*/, '');
    document.title = ready.length > 0 ? `【できあがり】${base}` : base;
  }, [ready.length]);

  if (ready.length === 0) return null;

  const first = ready[0];
  const breweryName = snapshot?.breweries.find((b) => b.id === first.breweryId)?.name ?? '';
  const dismiss = () => setShown([]);

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="rise-in flex w-full max-w-[456px] items-center gap-3 rounded-screen border-2 border-matcha bg-card p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        <span aria-hidden className="pulse-dot text-[26px] leading-none">
          🍶
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] leading-snug font-bold text-matcha">
            できあがりました！
          </span>
          <span className="text-[12px] leading-[1.5] text-ink-70">
            {breweryName}の「{first.brand}」（{first.cups} 杯）を、ブースで受け取ってください。
            {ready.length > 1 ? `（ほか ${ready.length - 1} 件）` : ''}
          </span>
        </div>
        {pathname !== '/guest' && (
          <button
            type="button"
            onClick={() => router.push('/guest')}
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
