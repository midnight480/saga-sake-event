import Link from 'next/link';

import { HelpSection, HelpText } from '@/components/Help';

/**
 * ヘルプの中の「利用規約・プライバシーポリシー」（Issue #64）。
 * 主催者・酒蔵・参加者のヘルプの末尾に置く。本文は /terms・/privacy（ログインなしでも読める）。
 */
export function LegalHelp() {
  return (
    <HelpSection title="利用規約・プライバシーポリシー">
      <HelpText>
        このサービスのサーバーは日本の外（シンガポール・アメリカ合衆国）にあり、そこに情報を
        保存します。何をどこに保存し、どう使うかは、プライバシーポリシーに書いています。
      </HelpText>
      <div className="flex flex-col gap-2">
        <Link
          href="/terms"
          className="flex min-h-12 items-center justify-between rounded-field border border-hairline bg-card px-4 text-[13.5px] text-ink hover:border-hairline-strong"
        >
          利用規約 <span aria-hidden className="text-ink-45">›</span>
        </Link>
        <Link
          href="/privacy"
          className="flex min-h-12 items-center justify-between rounded-field border border-hairline bg-card px-4 text-[13.5px] text-ink hover:border-hairline-strong"
        >
          プライバシーポリシー <span aria-hidden className="text-ink-45">›</span>
        </Link>
      </div>
    </HelpSection>
  );
}
