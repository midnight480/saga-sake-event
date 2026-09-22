'use client';

import { AppShell, type LogoutOptions, type Tab } from '@/components/AppShell';
import { ConsentModal } from '@/components/ConsentModal';
import { ReadyAlert } from '@/components/ReadyAlert';
import { orderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** 参加者のポイントと記録は、アカウント（メールアドレス）に結びついて残る。 */
const LOGOUT: LogoutOptions = {
  redirectUrl: '/',
  note: (
    <>
      ポイントの残りと、これまでの記録は消えません。
      <br />
      もう一度<strong className="text-ink">同じメールアドレス</strong>でログインすると、
      続きから使えます。
    </>
  ),
};

const TABS: Tab[] = [
  { href: '/guest', label: 'マイページ', icon: '◉' },
  { href: '/guest/breweries', label: '酒蔵をさがす', icon: '☷' },
  { href: '/guest/charge', label: 'チケット', icon: '＋' },
  // チケットの右に置く（Issue #32）。飲んだものを振り返る画面。
  { href: '/guest/record', label: '記録', icon: '✓' },
  { href: '/guest/help', label: 'ヘルプ', icon: '？' },
];

export function GuestShell({
  needsConsent,
  children,
}: {
  /** 利用規約・プライバシーポリシーの今の版に、まだ同意していないか（Issue #64）。 */
  needsConsent: boolean;
  children: React.ReactNode;
}) {
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
      logout={LOGOUT}
    >
      {children}
      {/* できあがりを音・振動・帯で知らせる（Issue #58）。 */}
      {snapshot?.guest && <ReadyAlert guestClerkId={snapshot.guest.clerkUserId} />}
      {needsConsent && <ConsentModal />}
    </AppShell>
  );
}
