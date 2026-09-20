import { redirect } from 'next/navigation';

import { getViewer, hasClerk } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';

import { OrganizerShell } from './shell';

// 設定の判定は必ずリクエストごとに行う。
// ここを静的に固めると、Vercel で Neon や Clerk を後から追加しても
// 「まだ未設定」の状態が焼き付いたままになり、主催者が /setup から抜け出せない。
export const dynamic = 'force-dynamic';

/**
 * 主催者だけが入れる区画。
 * 役割の確認はここでまとめて行い、配下のページでは繰り返さない。
 */
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !hasClerk()) redirect('/setup');

  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role !== 'organizer') {
    // 主催者以外がURLを直接開いた場合は、その人の持ち場へ送る。
    redirect(viewer.role === 'brewery' ? '/brewery' : '/guest');
  }

  return <OrganizerShell>{children}</OrganizerShell>;
}
