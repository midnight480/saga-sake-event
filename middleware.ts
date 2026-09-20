import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Clerk の鍵が入っていないうちは clerkMiddleware を通さない。
 *
 * 理由: 主催者はまず「環境変数なしの状態」でデプロイし、そのあと Vercel の
 * 画面で Clerk を追加する。もしここで鍵を必須にすると、その最初のデプロイが
 * 全ページ 500 になり、案内すべき /setup すら開けなくなる。
 */
const clerkConfigured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && !!process.env.CLERK_SECRET_KEY?.trim();

export default clerkConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Next.js の内部ファイルと静的ファイルは通さない
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
