import { redirect } from 'next/navigation';

import { getViewer, hasClerk } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';
import { getOrCreateGuest } from '@/lib/store';

import { GuestShell } from './shell';

// 設定の判定は必ずリクエストごとに行う。
// ここを静的に固めると、Vercel で Neon や Clerk を後から追加しても
// 「まだ未設定」の状態が焼き付いたままになり、主催者が /setup から抜け出せない。
export const dynamic = 'force-dynamic';

/** 参加者の区画。 */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !hasClerk()) redirect('/setup');

  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');

  // 主催者・蔵の人が参加者画面を見たい場合もあるが、台帳が混ざると
  // チケットの集計が狂うので、それぞれの持ち場へ戻す。
  if (viewer.role === 'organizer') redirect('/organizer');
  if (viewer.role === 'brewery') redirect('/brewery');

  // 初回アクセスでこの人の台帳を作る。
  await getOrCreateGuest(viewer.userId);

  return <GuestShell>{children}</GuestShell>;
}
