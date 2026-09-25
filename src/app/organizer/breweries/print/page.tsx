'use client';

import { useState, useTransition } from 'react';

import { regenerateAllBreweryPasswords } from '@/app/actions';
import { Button, Notice } from '@/components/ui';

type Row = {
  name: string;
  area: string;
  booth: string;
  loginId: string;
  password: string;
  failed?: boolean;
};

/**
 * 蔵に配る「ログイン案内」の台紙。
 *
 * パスワードは保存していないので、印刷するには作り直すしかない。
 * 作り直すと前に配った紙は使えなくなるため、押す前に必ず断りを入れる。
 */
export default function BreweryCredentialsPrintPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const result = await regenerateAllBreweryPasswords();
      if (result.ok && result.value) setRows(result.value);
      else if (!result.ok) setError(result.reason);
    });
  };

  return (
    <div className="min-h-dvh bg-sumi px-5 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[720px]">
        {!rows && (
          <div className="no-print flex flex-col gap-4">
            <h1 className="font-display text-[26px] tracking-[0.05em] text-ink">
              蔵アカウントの一括印刷
            </h1>
            <Notice tone="warn" title="押すと、前に配ったパスワードは使えなくなります">
              このアプリはパスワードを保存していません。印刷するには全蔵分を作り直します。
              すでに紙をお渡ししている場合は、新しい紙に差し替えてください。
            </Notice>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button tone="go" block onClick={generate} disabled={pending}>
              {pending ? '作成しています…' : '全蔵のパスワードを作り直して表示する'}
            </Button>
          </div>
        )}

        {rows && (
          <>
            <div className="no-print mb-6 flex flex-col gap-3">
              <Notice tone="info">
                この画面を印刷して、切り離して各蔵にお渡しください。閉じると再表示できません。
              </Notice>
              <Button tone="go" block onClick={() => window.print()}>
                印刷する
              </Button>
            </div>

            <div className="flex flex-col gap-4 print:gap-0">
              {rows.map((row) => (
                <article
                  key={row.loginId}
                  className="rounded-card border border-hairline bg-card p-5 print:mb-6 print:break-inside-avoid print:rounded-none print:border-black/30 print:bg-white print:text-black"
                >
                  <div className="text-[10px] tracking-[0.3em] text-gold print:text-black/60">
                    佐嘉 蔵めぐり ─ ログイン案内
                  </div>
                  <h2 className="mt-2 font-display text-[22px] tracking-[0.04em] text-ink print:text-black">
                    {row.name}
                  </h2>
                  <div className="mt-1 text-[12px] text-ink-55 print:text-black/60">
                    {[row.booth && `ブース ${row.booth}`, row.area].filter(Boolean).join(' ・ ')}
                  </div>

                  <dl className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 print:border-black/20">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[12px] text-ink-55 print:text-black/60">蔵ID</dt>
                      <dd className="font-mono text-[17px] font-bold text-ink print:text-black">
                        {row.loginId}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[12px] text-ink-55 print:text-black/60">パスワード</dt>
                      <dd
                        className={`font-mono text-[17px] font-bold ${
                          row.failed ? 'text-terracotta-soft' : 'text-gold'
                        } print:text-black`}
                      >
                        {row.password}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 text-[11px] leading-[1.8] text-ink-45 print:text-black/60">
                    スマートフォンのブラウザで会場のURLを開き、上のIDとパスワードでログインしてください。
                    持ち込む銘柄の登録と、注文の受付はこの画面から行います。
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
