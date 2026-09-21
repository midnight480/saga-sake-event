// ★ この import は必ず @clerk より前に置く（src/lib/env-init.ts の説明を参照）★
import '@/lib/env-init';

import type { Metadata, Viewport } from 'next';
import { BIZ_UDPGothic, Kaisei_HarunoUmi } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { jaJP } from '@clerk/localizations';

import { InstallHint } from '@/components/InstallHint';
import { clerkKeys, hasClerk } from '@/lib/auth';
import './globals.css';

// 書体は Google Fonts から取るが、next/font が自前配信に変えてくれる。
// 外部への追加リクエストが無くなるので、会場の細い回線でも表示が崩れにくい。
const body = BIZ_UDPGothic({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-biz',
});

const display = Kaisei_HarunoUmi({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-kaisei',
});

const DESCRIPTION =
  '佐賀の酒蔵が集まる合同試飲イベントの受付・在庫・チケットを 1 つにまとめた運営アプリ';

export const metadata: Metadata = {
  title: '佐賀 蔵めぐり',
  description: DESCRIPTION,
  // 当日の案内は LINE やメールで回る。貼ったときに何のリンクか分かるようにする。
  openGraph: {
    type: 'website',
    siteName: '佐賀 蔵めぐり',
    title: '佐賀 蔵めぐり',
    description: DESCRIPTION,
    locale: 'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
    title: '佐賀 蔵めぐり',
    description: DESCRIPTION,
  },
  // ホーム画面に追加したときの見た目。iPhone と Android のどちらでも効く。
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: '蔵めぐり' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 見えにくい人が拡大できるよう、ズームは禁止しない。
  // iOS の入力欄での自動ズームは globals.css の font-size:16px で防いでいる。
  maximumScale: 5,
  themeColor: '#101a14',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html lang="ja" className={`${body.variable} ${display.variable}`}>
      <body>
        {children}
        <InstallHint />
      </body>
    </html>
  );

  // Clerk の鍵が無いうちは Provider を付けない。
  // 付けると全ページが例外になり、案内画面 (/setup) すら開けなくなる。
  if (!hasClerk()) return content;

  // 鍵はここではっきり渡す。
  // Vercel の連携で入れると公開鍵の名前が
  // NEXT_PUBLIC_AUTHENTICATION_CLERK_PUBLISHABLE_KEY になることがあり、
  // その場合 Next.js はブラウザ側のコードに値を埋め込んでくれない。
  // サーバーで読んだ値を props として渡せば、名前が何であっても届く。
  const { publishableKey } = clerkKeys();

  return (
    <ClerkProvider localization={jaJP} afterSignOutUrl="/" publishableKey={publishableKey}>
      {content}
    </ClerkProvider>
  );
}
