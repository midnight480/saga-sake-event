'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { signInBrewery } from '@/app/actions';
import { Button, Eyebrow, Notice, inputClass } from '@/components/ui';

/**
 * 酒蔵のログイン。
 *
 * Clerk の標準画面を使わない理由は actions.ts の signInBrewery に書いてある。
 * 要するに、蔵アカウントのメールアドレスは受信できないので、標準の画面だと
 * 確認コードが届かず入れなくなる。
 */
export default function BreweryLoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await signInBrewery(loginId, password);
      if (result.ok && result.value) router.replace(result.value.url);
      else if (!result.ok) setError(result.reason);
    });
  };

  return (
    <div className="washi flex min-h-dvh items-center justify-center bg-sumi px-6 py-12">
      <div className="w-full max-w-[380px]">
        <Eyebrow>BREWERY</Eyebrow>
        <h1 className="font-display text-[30px] leading-[1.3] tracking-[0.06em] text-ink">
          蔵アカウント
          <br />
          ログイン
        </h1>
        <p className="mt-3 text-[12.5px] leading-[1.8] text-ink-55">
          主催者からお渡しした蔵IDとパスワードを入れてください。
        </p>

        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-[11px] leading-none tracking-[0.1em] text-ink-55">蔵ID</span>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="kura-001"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] leading-none tracking-[0.1em] text-ink-55">
              パスワード
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={`${inputClass} font-mono`}
            />
          </label>

          {error && <Notice tone="danger">{error}</Notice>}

          <Button tone="go" block type="submit" disabled={pending || !loginId || !password}>
            {pending ? 'ログインしています…' : 'ログイン'}
          </Button>
        </form>

        <div className="mt-8 flex flex-col gap-2 border-t border-hairline pt-6 text-[11.5px] leading-[1.9] text-ink-45">
          <p>
            パスワードが分からないときは、主催者に「再発行」してもらってください。
            その場で新しいものが出ます。
          </p>
          <p>
            <Link href="/">参加者・主催者の方はこちら</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
