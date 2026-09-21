'use client';

import { createContext, useContext } from 'react';

import { AppShell, type Tab } from '@/components/AppShell';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

const TABS: Tab[] = [
  { href: '/brewery', label: '受付キュー', icon: '☰' },
  { href: '/brewery/stock', label: '持ち込み登録', icon: '◈' },
  { href: '/brewery/help', label: 'ヘルプ', icon: '？' },
];

interface BreweryContextValue {
  breweryId: string;
  /** 主催者が代理で見ているか。表示に断りを入れるために使う。 */
  asOrganizer: boolean;
}

const BreweryContext = createContext<BreweryContextValue | null>(null);

/** 配下のページから「いまどの蔵か」を取る。 */
export function useBreweryContext(): BreweryContextValue {
  const value = useContext(BreweryContext);
  if (!value) throw new Error('BreweryShell の外で useBreweryContext は使えません');
  return value;
}

export function BreweryShell({
  breweryId,
  asOrganizer,
  children,
}: {
  breweryId: string;
  asOrganizer: boolean;
  children: React.ReactNode;
}) {
  const { snapshot, isStale } = useSnapshot();
  const brewery = snapshot?.breweries.find((b) => b.id === breweryId);

  return (
    <BreweryContext.Provider value={{ breweryId, asOrganizer }}>
      <AppShell
        role="酒蔵"
        roleEn="BREWERY"
        subject={brewery?.name}
        status={
        snapshot ? orderingStatus(snapshot.event, new Date(snapshot.serverTime)) : undefined
      }
        tabs={TABS}
        stale={isStale}
      >
        {asOrganizer && (
          <div className="bg-gold/10 px-5 py-2 text-center text-[11.5px] leading-snug text-gold">
            主催者として代理で操作しています。
          </div>
        )}
        {children}
      </AppShell>
    </BreweryContext.Provider>
  );
}
