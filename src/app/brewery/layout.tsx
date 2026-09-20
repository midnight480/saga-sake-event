import { redirect } from 'next/navigation';

import { getViewer, hasClerk } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';

import { BreweryShell } from './shell';

// 設定の判定は必ずリクエストごとに行う。
// ここを静的に固めると、Vercel で Neon や Clerk を後から追加しても
// 「まだ未設定」の状態が焼き付いたままになり、主催者が /setup から抜け出せない。
export const dynamic = 'force-dynamic';

/**
 * 酒蔵の区画。
 *
 * 蔵アカウントは自分の蔵だけを見る。主催者が代理で操作することもあるため、
 * 主催者も入れるが、その場合はどの蔵かを選んでもらう必要がある
 * （当面は 1 蔵目を既定にしている）。
 */
export default async function BreweryLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !hasClerk()) redirect('/setup');

  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');

  if (viewer.role === 'guest') redirect('/guest');

  // 蔵アカウントなら自分の蔵。主催者なら代理操作として最初の蔵。
  let breweryId = viewer.breweryId ?? null;
  if (!breweryId && viewer.role === 'organizer') {
    const { listBreweries } = await import('@/lib/store');
    breweryId = (await listBreweries())[0]?.id ?? null;
  }

  if (!breweryId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-sumi px-6 text-center">
        <p className="max-w-[360px] text-[13px] leading-[1.9] text-ink-55">
          まだ酒蔵が登録されていません。
          <br />
          主催者の「蔵アカウント」から登録してください。
        </p>
      </div>
    );
  }

  return (
    <BreweryShell breweryId={breweryId} asOrganizer={viewer.role === 'organizer'}>
      {children}
    </BreweryShell>
  );
}
