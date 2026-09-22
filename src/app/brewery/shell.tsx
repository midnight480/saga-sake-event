'use client';

import { createContext, useContext } from 'react';

import { AppShell, type LogoutOptions, type Tab } from '@/components/AppShell';
import { ConsentModal } from '@/components/ConsentModal';
import { NewRequestAlert } from '@/components/NewRequestAlert';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 蔵は入り直すのに蔵ID とパスワードが要る。パスワードは発行した直後の 1 回しか
 * 見られないので、控えが無いと主催者に再発行してもらうことになる。確認の画面で
 * それを先に伝える。
 */
const BREWERY_LOGOUT: LogoutOptions = {
  redirectUrl: '/brewery-login',
  note: (
    <>
      登録した銘柄や受けた注文は消えません。
      <br />
      <strong className="text-terracotta-soft">
        もう一度入るには、蔵ID とパスワードが要ります。
      </strong>
      お手元に控えがなければ、主催者に再発行を頼んでください。
    </>
  ),
};

/** 主催者が代理で見ているときは、主催者のログアウトになる。 */
const ORGANIZER_LOGOUT: LogoutOptions = {
  redirectUrl: '/',
  note: (
    <>
      主催者のアカウントからログアウトします。イベントのデータは消えません。
    </>
  ),
};

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
  needsConsent,
  children,
}: {
  breweryId: string;
  asOrganizer: boolean;
  /** 利用規約・プライバシーポリシーの今の版に、まだ同意していないか（Issue #64）。 */
  needsConsent: boolean;
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
        logout={asOrganizer ? ORGANIZER_LOGOUT : BREWERY_LOGOUT}
      >
        {asOrganizer && (
          <div className="bg-gold/10 px-5 py-2 text-center text-[11.5px] leading-snug text-gold">
            主催者として代理で操作しています。
          </div>
        )}
        {children}
        {/* 新しいリクエストを音・振動・帯で知らせる（Issue #51）。代理で見ている主催者には鳴らさない。 */}
        {!asOrganizer && <NewRequestAlert breweryId={breweryId} />}
        {needsConsent && <ConsentModal />}
      </AppShell>
    </BreweryContext.Provider>
  );
}
