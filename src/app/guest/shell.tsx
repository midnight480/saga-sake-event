'use client';

import { AppShell, type Tab } from '@/components/AppShell';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

const TABS: Tab[] = [
  { href: '/guest', label: 'マイページ', icon: '◉' },
  { href: '/guest/breweries', label: '酒蔵をさがす', icon: '☷' },
  { href: '/guest/charge', label: 'チケット', icon: '＋' },
  // チケットの右に置く（Issue #32）。飲んだものを振り返る画面。
  { href: '/guest/record', label: '記録', icon: '✓' },
  { href: '/guest/help', label: 'ヘルプ', icon: '？' },
];

export function GuestShell({ children }: { children: React.ReactNode }) {
  const { snapshot, isStale } = useSnapshot();

  return (
    <AppShell
      role="参加者"
      roleEn="GUEST"
      subject={snapshot?.guest?.displayNo}
      status={
        snapshot ? orderingStatus(snapshot.event, new Date(snapshot.serverTime)) : undefined
      }
      tabs={TABS}
      stale={isStale}
    >
      {children}
    </AppShell>
  );
}
