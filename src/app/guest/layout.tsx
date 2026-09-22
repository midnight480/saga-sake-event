import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getViewer, hasClerk } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';
import { LEGAL_VERSION } from '@/lib/legal';
import { getOrCreateGuest, hasConsented } from '@/lib/store';

import { GuestShell } from './shell';

// 設定の判定は必ずリクエストごとに行う。
// ここを静的に固めると、Vercel で Neon や Clerk を後から追加しても
// 「まだ未設定」の状態が焼き付いたままになり、主催者が /setup から抜け出せない。
export const dynamic = 'force-dynamic';

/** 参加者の区画。 */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !hasClerk()) redirect('/setup');

  const viewer = await getViewer();
  if (!viewer) {
    // ログインが済んだら、開こうとしていた画面へ戻す。券の QR を読んで来た
    // 人は ?code= を持っているので、戻さないとポイントが入らないまま終わる。
    // 自分のサイト内のパスだけを通す（"//" で始まるものは別のサイトになる）。
    const path = (await headers()).get('x-request-path') ?? '';
    const back = path.startsWith('/') && !path.startsWith('//') ? path : '/guest';
    redirect(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
  }

  // 主催者・蔵の人が参加者画面を見たい場合もあるが、台帳が混ざると
  // チケットの集計が狂うので、それぞれの持ち場へ戻す。
  if (viewer.role === 'organizer') redirect('/organizer');
  if (viewer.role === 'brewery') redirect('/brewery');

  // 初回アクセスでこの人の台帳を作る。利用規約・プライバシーポリシーへの同意も
  // 同時に確かめる（Issue #64）。どちらもデータベースへの問い合わせなので並べて投げる。
  const [, consented] = await Promise.all([
    getOrCreateGuest(viewer.userId),
    hasConsented(viewer.userId, LEGAL_VERSION),
  ]);

  return <GuestShell needsConsent={!consented}>{children}</GuestShell>;
}
