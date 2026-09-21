'use client';

import { AppShell, type Tab } from '@/components/AppShell';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

const TABS: Tab[] = [
  { href: '/organizer', label: 'ダッシュボード', icon: '◱' },
  { href: '/organizer/event', label: 'イベント設定', icon: '⚙' },
  { href: '/organizer/breweries', label: '蔵アカウント', icon: '◈' },
  { href: '/organizer/tickets', label: 'チケットQR', icon: '▦' },
];

export function OrganizerShell({ children }: { children: React.ReactNode }) {
  // SWR は同じキーの購読をまとめるので、各ページが個別に呼んでも通信は 1 本。
  const { snapshot, isStale } = useSnapshot();

  return (
    <AppShell
      role="主催者"
      roleEn="ORGANIZER"
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
