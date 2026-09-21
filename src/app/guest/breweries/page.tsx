'use client';

import Link from 'next/link';

import { CrowdBadge, Empty, Note, ScreenHeader, Title } from '@/components/ui';
import { crowdLevel, itemAvailableCups, waitingCount } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** 酒蔵をさがす。混み具合と残りを見て、どこへ行くか決める画面。 */
export default function GuestBreweryListPage() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const { breweries, requests } = snapshot;

  return (
    <>
      <ScreenHeader>
        <Title>酒蔵をさがす</Title>
        <div className="mt-2">
          <Note>{breweries.length} 蔵が出展。混み具合と残りを見て決められます。</Note>
        </div>
      </ScreenHeader>

      <div className="flex flex-col gap-3 px-5 py-4">
        {breweries.length === 0 ? (
          <Empty>まだ出展する酒蔵が登録されていません。</Empty>
        ) : (
          breweries.map((brewery) => {
            const waiting = waitingCount(requests, brewery.id);
            return (
              <Link
                key={brewery.id}
                href={`/guest/breweries/${brewery.id}`}
                className="flex w-full flex-col gap-3 rounded-card border border-hairline bg-card p-4 text-left transition-colors hover:border-hairline-strong"
              >
                <div className="flex w-full items-center justify-between gap-2.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-display text-[19px] tracking-[0.04em] text-ink">
                      {brewery.name}
                    </span>
                    <span className="text-[11.5px] leading-none text-ink-55">
                      {[brewery.booth && `ブース ${brewery.booth}`, brewery.area]
                        .filter(Boolean)
                        .join(' ・ ') || '―'}
                    </span>
                  </div>
                  <CrowdBadge level={crowdLevel(waiting)} closed={!brewery.accepting} />
                </div>

                {brewery.items.length > 0 && (
                  <div className="flex w-full flex-wrap gap-1.5">
                    {brewery.items.map((item) => {
                      // 参加者に見せるのは「いま頼める数」。物理的な残りではない。
                      const left = itemAvailableCups(item);
                      return (
                        <span
                          key={item.id}
                          className={`rounded-[7px] bg-ink/7 px-2.5 py-1.5 text-[11px] leading-none ${
                            left === 0 ? 'text-ink-45 line-through' : 'text-ink-70'
                          }`}
                        >
                          {item.name} 残{left}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
