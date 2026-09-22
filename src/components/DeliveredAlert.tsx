'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAlertPrefs } from '@/lib/breweryAlert';
import { takeNewlyDelivered, type OrderRequest } from '@/lib/domain';
import { VIBRATE_SUCCESS, playSuccess, vibrate } from '@/lib/sound';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 受け取った（蔵が「受渡完了」にした）ら、記録の画面へ案内する係（Issue #66）。
 *
 * リクエストのあとはマイページで進み具合を待ってもらい、受け取ったら記録へ移して、
 * まだ飲んでいない銘柄が分かるようにする。🔔 への記録とスマホの通知はサーバーが送る
 * （push.ts の sendDeliveredNotice。通知を押すと記録が開く）。
 *
 * ★ 勝手に画面を切り替えるのは、マイページにいるときだけ ★
 * 受け取るとき、参加者はふつうマイページで待っている。ほかの画面（次の蔵を選んで
 * いる最中など）にいるときに切り替えると、選んでいた途中が消えて困るので、
 * 帯で「記録を見る」を出すだけにする。
 */
export function DeliveredAlert({ guestClerkId }: { guestClerkId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { snapshot } = useSnapshot();
  const prefs = useAlertPrefs('guest');

  const seen = useRef<Set<number> | null>(null);
  const [banner, setBanner] = useState<OrderRequest | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    const { seen: next, arrived } = takeNewlyDelivered(seen.current, snapshot.requests, guestClerkId);
    seen.current = next;
    if (arrived.length === 0) return;

    // 受け取れた手ごたえ。券の読み取りの成功と同じ明るい音にする。
    if (prefs.sound) playSuccess();
    if (prefs.vibrate) vibrate(VIBRATE_SUCCESS);

    if (pathname === '/guest') {
      router.push('/guest/record');
    } else if (pathname !== '/guest/record') {
      setBanner(arrived[0]);
    }
  }, [snapshot, guestClerkId, pathname, router, prefs.sound, prefs.vibrate]);

  // 記録を開いたら、帯は要らない。
  useEffect(() => {
    if (pathname === '/guest/record') setBanner(null);
  }, [pathname]);

  if (!banner) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="rise-in flex w-full max-w-[456px] items-center gap-3 rounded-screen border-2 border-gold bg-card p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        <span aria-hidden className="text-[26px] leading-none">
          ✓
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] leading-snug font-bold text-gold-bright">受け取りました</span>
          <span className="truncate text-[12px] leading-none text-ink-70">
            「{banner.brand}」を記録に加えました
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push('/guest/record')}
          className="min-h-11 flex-none rounded-[9px] bg-terracotta px-3.5 text-[13px] font-bold text-white"
        >
          記録を見る
        </button>
        <button
          type="button"
          onClick={() => setBanner(null)}
          aria-label="閉じる"
          className="flex size-11 flex-none items-center justify-center rounded-full text-[16px] text-ink-55 hover:bg-ink/7"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
