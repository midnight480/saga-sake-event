'use client';

import { AppShell, type Tab } from '@/components/AppShell';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

const TABS: Tab[] = [
  // タブが 5 つ並ぶので、狭い端末でも収まる長さにしている。
  { href: '/organizer', label: '運営状況', icon: '◱' },
  { href: '/organizer/event', label: '設定', icon: '⚙' },
  { href: '/organizer/breweries', label: '酒蔵', icon: '◈' },
  { href: '/organizer/tickets', label: 'チケット', icon: '▦' },
  { href: '/organizer/inquiries', label: '問合せ', icon: '✉' },
  { href: '/organizer/help', label: 'ヘルプ', icon: '？' },
];

export function OrganizerShell({ children }: { children: React.ReactNode }) {
  // SWR は同じキーの購読をまとめるので、各ページが個別に呼んでも通信は 1 本。
  const { snapshot, isStale } = useSnapshot();

  // 返事待ちの件数をタブに出す。当日、主催者は問い合わせ画面を開いたままには
  // しないので、気づける印が要る。
  const tabs = TABS.map((tab) =>
    tab.href === '/organizer/inquiries' ? { ...tab, badge: snapshot?.openInquiries ?? 0 } : tab,
  );

  return (
    <AppShell
      role="主催者"
      roleEn="ORGANIZER"
      status={
        snapshot ? orderingStatus(snapshot.event, new Date(snapshot.serverTime)) : undefined
      }
      tabs={tabs}
      stale={isStale}
    >
      {children}
    </AppShell>
  );
}
