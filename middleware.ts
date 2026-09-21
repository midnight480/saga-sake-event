// ★ この import は必ず @clerk より前に置く ★
// 読み込まれた瞬間に環境変数の名前ゆれをそろえる。Clerk は読み込み時に
// process.env を見るので、順番が逆だと素の CLERK_SECRET_KEY（空）を掴む。
import '@/lib/env-init';

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { clerkKeys, hasClerk } from '@/lib/auth';

/**
 * Clerk の鍵が入っていないうちは clerkMiddleware を通さない。
 *
 * 理由: 主催者はまず「環境変数なしの状態」でデプロイし、そのあと Vercel の
 * 画面で Clerk を追加する。もしここで鍵を必須にすると、その最初のデプロイが
 * 全ページ 500 になり、案内すべき /setup すら開けなくなる。
 */
// 公開鍵だけを明示的に渡す。
// secretKey を渡すと Clerk が CLERK_ENCRYPTION_KEY を要求するようになり、
// 主催者に設定してもらう項目が 1 つ増えてしまう。秘密鍵は env-init が
// process.env に書き戻したものを Clerk 自身に読ませる。
export default hasClerk()
  ? clerkMiddleware(
      async (_auth, req) => {
        // レイアウトからは「いま開こうとしている URL」が見えない。
        // 参加者が券の QR（/guest/charge?code=…）をログイン前に読んだとき、
        // ログイン後にそこへ戻さないとコードが失われ、もう一度読むことになる。
        // それを避けるため、パスとクエリをヘッダで渡しておく（guest/layout.tsx）。
        const headers = new Headers(req.headers);
        headers.set('x-request-path', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.next({ request: { headers } });
      },
      { publishableKey: clerkKeys().publishableKey },
    )
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Next.js の内部ファイルと静的ファイルは通さない
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
