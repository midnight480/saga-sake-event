'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useRef, useState, useTransition } from 'react';

import { agreeToLegal } from '@/app/actions';
import { PrivacyPolicy, TermsOfService } from '@/components/LegalDocuments';
import { Button, Notice } from '@/components/ui';
import { LEGAL_VERSION } from '@/lib/legal';

/**
 * 使いはじめに、利用規約とプライバシーポリシーへの同意をもらう（Issue #64）。
 *
 * 本文はこの中でスクロールして読めるようにし、最後まで読むと「同意する」が
 * 押せるようになる。読まずに押せると、同意をもらったことにならないため。
 * 外側を押しても閉じない（同意しないと使えないため）。同意しない人には、
 * 使えないことを伝えてログアウトできるようにする。
 *
 * 同意は版ごとにデータベースに残す（consents）。本文を改めて版を上げると、
 * もう一度これが出る。参加者と酒蔵にだけ出す（主催者はサービスを提供する側）。
 */
export function ConsentModal() {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(true);
  const [readToEnd, setReadToEnd] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  // 開いている間は、後ろの画面が動かないようにする。
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  // 最後まで読んだか。文字を大きくしている端末などで、最初から全部見えている場合も考える。
  const check = () => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
  };
  useEffect(check, []);

  if (!open) return null;

  const agree = () => {
    setError(null);
    startTransition(async () => {
      const result = await agreeToLegal(LEGAL_VERSION);
      if (result.ok) setOpen(false);
      else setError(result.reason);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/70 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="flex w-full max-w-[456px] flex-col overflow-hidden rounded-screen border border-hairline-strong bg-card shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex flex-col gap-1.5 border-b border-hairline px-4 py-3.5">
          <h2 id="consent-title" className="font-display text-[19px] tracking-[0.04em] text-ink">
            ご利用の前に
          </h2>
          <p className="text-[12px] leading-[1.7] text-ink-55">
            利用規約とプライバシーポリシーをお読みください。サービスのサーバーは日本の外
            （シンガポール・アメリカ合衆国）にあり、そこに情報を保存します。最後まで読むと、
            同意して使いはじめられます。
          </p>
        </div>

        <div
          ref={scroller}
          onScroll={check}
          tabIndex={0}
          aria-label="利用規約とプライバシーポリシーの本文"
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          <TermsOfService />
          <hr className="my-8 border-hairline" />
          <PrivacyPolicy />
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline p-3">
          {error && <Notice tone="danger">{error}</Notice>}

          {declined ? (
            <>
              <Notice tone="warn" title="同意いただけない場合は、ご利用いただけません">
                お手数ですが、ログアウトしてください。内容について分からないことがあれば、
                会場の受付にお声がけください。
              </Notice>
              <div className="flex gap-2">
                <Button tone="ghost" className="flex-1" onClick={() => setDeclined(false)}>
                  戻って読む
                </Button>
                <Button tone="danger" className="flex-1" onClick={() => signOut({ redirectUrl: '/' })}>
                  ログアウト
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button tone="go" block onClick={agree} disabled={!readToEnd || pending}>
                {pending
                  ? '記録しています…'
                  : readToEnd
                    ? '同意して使いはじめる'
                    : '最後までお読みください'}
              </Button>
              <button
                type="button"
                onClick={() => setDeclined(true)}
                className="min-h-11 text-[12.5px] text-ink-55 underline"
              >
                同意しない
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
