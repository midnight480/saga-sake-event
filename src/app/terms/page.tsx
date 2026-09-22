import type { Metadata } from 'next';
import Link from 'next/link';

import { TermsOfService } from '@/components/LegalDocuments';

export const metadata: Metadata = { title: '利用規約 ─ 佐賀 蔵めぐり' };

/**
 * 利用規約（Issue #64）。ログインしなくても読めるようにしている。
 * 登録する前に内容を確かめられるように。本文は components/LegalDocuments.tsx。
 */
export default function Page() {
  return (
    <div className="washi flex min-h-dvh justify-center bg-sumi">
      <div className="w-full max-w-[480px] bg-surface px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Link href="/" className="inline-flex min-h-11 items-center text-[12.5px] text-ink-55 hover:text-ink">
          ← 佐賀 蔵めぐり
        </Link>
        <TermsOfService />
      </div>
    </div>
  );
}
