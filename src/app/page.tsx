import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getViewer, hasClerk } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';

// 設定の判定は必ずリクエストごとに行う。
// ここを静的に固めると、Vercel で Neon や Clerk を後から追加しても
// 「まだ未設定」の状態が焼き付いたままになり、主催者が /setup から抜け出せない。
export const dynamic = 'force-dynamic';

/**
 * 入口。
 *
 * ログイン済みなら、その人の役割の画面へそのまま送る。会場では 3 種類の人が
 * 同じ URL を渡されるので、「自分がどれを押すか」を考えさせない。
 */
export default async function Home() {
  // 準備が終わっていないうちは、何よりも先に案内画面へ。
  if (!hasDatabase() || !hasClerk()) redirect('/setup');

  const viewer = await getViewer();
  if (viewer?.role === 'organizer') redirect('/organizer');
  if (viewer?.role === 'brewery') redirect('/brewery');
  if (viewer?.role === 'guest') redirect('/guest');

  return (
    <div className="washi flex min-h-dvh items-center justify-center bg-sumi px-6 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-3 text-[11px] leading-none tracking-[0.34em] text-gold">
          SAGA SAKE FESTIVAL
        </div>
        <h1 className="font-display text-[38px] leading-[1.1] tracking-[0.06em] text-ink">
          佐嘉 蔵めぐり
        </h1>
        <p className="mt-4 text-[13px] leading-[1.9] text-ink-55">
          佐賀の酒蔵が集まる合同試飲イベントの受付アプリです。
          <br />
          お手持ちのスマートフォンのブラウザでそのまま使えます。
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="flex min-h-14 items-center justify-center rounded-field bg-terracotta text-[15px] font-bold tracking-[0.1em] text-white transition-colors hover:bg-terracotta-hover"
          >
            ログイン
          </Link>
          <Link
            href="/sign-up"
            className="flex min-h-14 items-center justify-center rounded-field border border-gold/50 text-[14px] font-bold tracking-[0.08em] text-gold transition-colors hover:bg-gold/12"
          >
            はじめて参加する（登録）
          </Link>
          <Link
            href="/brewery-login"
            className="flex min-h-14 items-center justify-center rounded-field border border-hairline-strong text-[14px] font-bold tracking-[0.08em] text-ink-70 transition-colors hover:text-ink"
          >
            酒蔵の方はこちら
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-[11.5px] leading-[1.9] text-ink-45">
          <p>
            <span className="text-gold">酒蔵の方</span>
            ：「酒蔵の方はこちら」から、主催者にお渡しした蔵ID（kura-001 など）と
            パスワードでログインしてください。
          </p>
          <p>
            <span className="text-gold">参加者の方</span>
            ：メールアドレスで登録できます。パスワードは不要で、届いた数字を入れるだけです。
          </p>
        </div>
      </div>
    </div>
  );
}
