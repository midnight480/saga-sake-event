import Link from 'next/link';

import { getSetupState, type Check } from '@/lib/setup-state';

export const dynamic = 'force-dynamic';

/**
 * セットアップの進み具合を見せる画面。
 *
 * この画面だけは、環境変数が何も無い状態でも必ず開けなければならない。
 * ここが開けないと、主催者は真っ白なエラー画面の前で詰む。だから DB にも
 * Clerk にも依存しない作りにしてある（診断は個別に try/catch している）。
 */
export default async function SetupPage() {
  const { checks, ready } = await getSetupState();
  const doneCount = checks.filter((c) => c.status === 'ok').length;

  return (
    <div className="washi min-h-dvh bg-sumi px-5 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-3 text-[11px] leading-none tracking-[0.34em] text-gold">SETUP</div>
        <h1 className="font-display text-[32px] leading-[1.2] tracking-[0.05em] text-ink">
          はじめの設定
        </h1>
        <p className="mt-4 text-[13px] leading-[1.9] text-ink-55">
          あと {checks.length - doneCount} か所の設定で使えるようになります。
          上から順に進めてください。作業はすべて Vercel の画面でのクリックだけで終わります。
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-ink/10">
            <div
              className="h-full rounded-sm bg-gold transition-[width] duration-500"
              style={{ width: `${Math.round((doneCount / checks.length) * 100)}%` }}
            />
          </div>
          <span className="flex-none text-[12px] text-ink-55">
            {doneCount} / {checks.length}
          </span>
        </div>

        {ready && (
          <div className="mt-8 flex flex-col gap-3 rounded-card border border-matcha/45 bg-matcha/12 p-5">
            <div className="text-[13px] font-bold tracking-[0.08em] text-matcha">
              設定はすべて終わっています
            </div>
            <p className="text-[12.5px] leading-[1.8] text-ink/85">
              運営の画面に進めます。まずイベントの日付と時刻を決めて、酒蔵のアカウントを発行してください。
            </p>
            <Link
              href="/organizer"
              className="mt-1 flex min-h-12 items-center justify-center rounded-[9px] bg-terracotta text-[13px] font-bold text-white transition-colors hover:bg-terracotta-hover"
            >
              運営の画面をひらく
            </Link>
          </div>
        )}

        <ol className="mt-8 flex flex-col gap-4">
          {checks.map((check, index) => (
            <li key={check.id}>
              <CheckCard check={check} index={index + 1} />
            </li>
          ))}
        </ol>

        <div className="mt-10 border-t border-hairline pt-6 text-[11.5px] leading-[1.9] text-ink-45">
          <p>
            うまくいかないときは{' '}
            <Link href="https://github.com/midnight480/saga-sake-event/blob/main/docs/よくあるトラブル.md">
              よくあるトラブル
            </Link>{' '}
            を見てください。設定を変えたあとは、この画面を再読み込みすると判定が変わります。
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckCard({ check, index }: { check: Check; index: number }) {
  const skin = {
    ok: 'border-matcha/40 bg-matcha/8',
    todo: 'border-gold/40 bg-gold/8',
    error: 'border-terracotta/50 bg-terracotta/10',
  }[check.status];

  const mark = { ok: '✓', todo: String(index), error: '!' }[check.status];
  const markSkin = {
    ok: 'bg-matcha/20 text-matcha',
    todo: 'bg-gold/20 text-gold',
    error: 'bg-terracotta/25 text-terracotta-soft',
  }[check.status];

  return (
    <div className={`flex flex-col gap-3 rounded-card border p-5 ${skin}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold ${markSkin}`}
        >
          {mark}
        </span>
        <h2 className="font-display text-[19px] tracking-[0.04em] text-ink">{check.title}</h2>
      </div>

      {check.done && <p className="text-[12.5px] leading-[1.8] text-ink-55">{check.done}</p>}

      {check.steps && (
        <ol className="flex flex-col gap-2 text-[12.5px] leading-[1.8] text-ink/85">
          {check.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex-none text-gold">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {check.link && check.status !== 'ok' && (
        <a
          href={check.link.href}
          target={check.link.href.startsWith('/') ? undefined : '_blank'}
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center rounded-[9px] border border-gold/45 bg-gold/10 text-[13px] font-bold text-gold transition-colors hover:bg-gold/20"
        >
          {check.link.label}
        </a>
      )}

      {check.detail && check.status !== 'ok' && (
        <details className="text-[11px] leading-[1.7] text-ink-45">
          <summary className="cursor-pointer">技術的な詳細（開発者向け）</summary>
          <p className="mt-2 font-mono break-all">{check.detail}</p>
        </details>
      )}
    </div>
  );
}
