'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { EventPhase } from '@/lib/domain';

export interface Tab {
  href: string;
  label: string;
  icon: string;
}

/**
 * どの役割でも共通の外枠。
 *
 * スマホ 1 台で完結する操作なので、幅は 480px までに抑えて中央に置く。
 * PC の大画面で開いても同じ操作ができるよう、横に広げず「大きなスマホ」として
 * 見せる。会場では主催者が PC、蔵と参加者がスマホ、という混在になる。
 */
export function AppShell({
  role,
  roleEn,
  subject,
  phase,
  tabs,
  stale,
  children,
}: {
  role: string;
  roleEn: string;
  subject?: string;
  phase?: EventPhase;
  tabs: Tab[];
  stale?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="washi flex min-h-dvh justify-center bg-sumi">
      <div className="flex min-h-dvh w-full max-w-[480px] flex-col bg-surface shadow-[0_0_80px_rgba(0,0,0,0.4)]">
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-display text-[17px] tracking-[0.08em] text-ink">{role}</span>
            <span className="truncate text-[10px] tracking-[0.12em] text-ink-45">
              {roleEn}
              {subject ? ` ─ ${subject}` : ''}
            </span>
          </div>
          {phase && <PhaseChip phase={phase} />}
        </header>

        {stale && (
          <div className="bg-amber/12 px-5 py-2 text-center text-[11.5px] leading-snug text-amber">
            通信が不安定です。表示は少し前の状態かもしれません。
          </div>
        )}

        <main className="flex-1 overflow-y-auto pb-4">{children}</main>

        <nav
          aria-label="画面の切り替え"
          className="flex border-t border-hairline bg-surface pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {tabs.map((tab) => {
            // 完全一致か、配下のページを開いているときに点灯させる。
            const active =
              pathname === tab.href ||
              (tab.href !== '/organizer' &&
                tab.href !== '/brewery' &&
                tab.href !== '/guest' &&
                pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 ${
                  active ? 'text-gold-bright' : 'text-ink-45'
                }`}
              >
                <span aria-hidden className="text-[17px] leading-none">
                  {tab.icon}
                </span>
                <span className="text-[10.5px] leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

const PHASE_TEXT: Record<EventPhase, string> = {
  before: '開始前',
  open: '開催中',
  closed: '終了',
};

function PhaseChip({ phase }: { phase: EventPhase }) {
  const dot =
    phase === 'open' ? 'bg-matcha' : phase === 'before' ? 'bg-gold' : 'bg-ink/40';
  return (
    <span className="flex flex-none items-center gap-2 rounded-full border border-hairline-strong bg-card px-3 py-1.5">
      <span className={`size-[7px] rounded-full ${dot} ${phase === 'open' ? 'pulse-dot' : ''}`} />
      <span className="text-[11.5px] font-bold leading-none whitespace-nowrap text-ink">
        {PHASE_TEXT[phase]}
      </span>
    </span>
  );
}
