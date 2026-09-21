import { SignIn } from '@clerk/nextjs';

import { clerkAppearance } from '@/components/clerkAppearance';

export default function Page() {
  return (
    <div className="washi flex min-h-dvh items-center justify-center bg-sumi px-5 py-12">
      {/*
        行き先を既定値まかせにしない。
        path routing でここに来ているので、登録・ログインが終わったあとの
        遷移先も明示しておく。"/" は役割に応じて振り分ける入口。
      */}
      <SignIn
        appearance={clerkAppearance}
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      />
    </div>
  );
}
