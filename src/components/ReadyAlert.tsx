'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAlertPrefs } from '@/lib/breweryAlert';
import { takeNewlyReady, type OrderRequest } from '@/lib/domain';
import { ReceiveButton } from '@/components/ReceiveButton';
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
 *
 * 帯の中に「受け取りました」（Issue #72）を置く。どの画面を開いていても、ブースで
 * 蔵の人に見せてその場で押せるように。「記録を見る」を押したら帯を閉じる（Issue #71。
 * ✕ を押さないと消えない、という声があった）。
 *
 * 蔵が催促したとき（Issue #73）は、閉じていても帯を出し直して、もう一度鳴らす。
 */
export function ReadyAlert({ guestClerkId }: { guestClerkId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { snapshot } = useSnapshot();
  const prefs = useAlertPrefs('guest');

  const seen = useRef<Set<number> | null>(null);
  // 注文ごとの、最後に見た催促の時刻。変わったら催促が来たということ。
  const reminders = useRef<Map<number, string> | null>(null);
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

    // ── 催促（Issue #73）を見つける ──
    const firstLook = reminders.current === null;
    const before = reminders.current ?? new Map<number, string>();
    const after = new Map<number, string>();
    const reminded: OrderRequest[] = [];
    for (const r of snapshot.requests) {
      if (r.guestClerkId !== guestClerkId || r.status !== 'ready' || !r.remindedAt) continue;
      after.set(r.id, r.remindedAt);
      if (!firstLook && before.get(r.id) !== r.remindedAt) reminded.push(r);
    }
    reminders.current = after;

    const fresh = [...arrived, ...reminded.filter((r) => !arrived.includes(r))];
    if (fresh.length === 0) return;

    const freshIds = fresh.map((r) => r.id);
    setShown((ids) => [...freshIds, ...ids.filter((id) => !freshIds.includes(id))]);
    // 開いた時点ですでにできあがっていたものは、帯だけ出して鳴らさない。
    if (!initial || reminded.length > 0) {
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
    <>
      {/* 帯に隠れる分だけ、ページの下に余白を足す。いちばん下の注文まで見えるように。 */}
      <div aria-hidden className="h-40 flex-none" />
      <div
        role="alert"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="rise-in flex w-full max-w-[456px] flex-col gap-2.5 rounded-screen border-2 border-matcha bg-card p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-start gap-3">
            <span aria-hidden className="pulse-dot text-[26px] leading-none">
              🍶
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[14px] leading-snug font-bold text-matcha">
                {first.remindedAt ? '蔵がお待ちしています' : 'できあがりました！'}
              </span>
              <span className="text-[12px] leading-[1.5] text-ink-70">
                {breweryName}の「{first.brand}」（{first.cups} 杯）を、ブースで受け取ってください。
                {ready.length > 1 ? `（ほか ${ready.length - 1} 件）` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="閉じる"
              className="-mt-1.5 -mr-1.5 flex size-11 flex-none items-center justify-center rounded-full text-[16px] text-ink-55 hover:bg-ink/7"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <ReceiveButton request={first} breweryName={breweryName} className="flex-1" />
            {pathname !== '/guest/record' && (
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  router.push('/guest/record');
                }}
                className="min-h-12 flex-none self-start rounded-[9px] border border-hairline-strong px-3.5 text-[13px] font-bold text-ink hover:bg-ink/8"
              >
                記録を見る
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
