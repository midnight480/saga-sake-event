'use client';

import Link from 'next/link';

import { CrowdBadge, Empty, Note, ScreenHeader, Title } from '@/components/ui';
import {
  crowdLevel,
  itemAvailableCups,
  waitingCount,
  type Brewery,
} from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** 酒蔵をさがす。混み具合・残り・必要なチケット枚数を見て、どこへ行くか決める画面。 */
export default function GuestBreweryListPage() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const { breweries, requests } = snapshot;
  const tickets = snapshot.guest?.tickets ?? 0;

  // いま頼める蔵が何軒あるかを先に出す。残高が足りないまま歩き回らせない。
  const affordableCount = breweries.filter((b) => canOrderHere(b, tickets)).length;

  return (
    <>
      <ScreenHeader>
        <Title>酒蔵をさがす</Title>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[28px] leading-none text-gold">{tickets}</span>
          <span className="text-[12px] text-ink-55">ポイントで</span>
          <span className="font-display text-[22px] leading-none text-ink">
            {affordableCount}
          </span>
          <span className="text-[12px] text-ink-55">蔵 いけます</span>
        </div>
        <div className="mt-2">
          <Note>
            {breweries.length} 蔵が出展。いま頼めない蔵は薄く表示しています。
          </Note>
        </div>
      </ScreenHeader>

      <div className="flex flex-col gap-3 px-5 py-4">
        {breweries.length === 0 ? (
          <Empty>まだ出展する酒蔵が登録されていません。</Empty>
        ) : (
          breweries.map((brewery) => (
            <BreweryRow
              key={brewery.id}
              brewery={brewery}
              tickets={tickets}
              waiting={waitingCount(requests, brewery.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

/** いまの残高で、この蔵の何かを 1 杯でも頼めるか。 */
function canOrderHere(brewery: Brewery, tickets: number): boolean {
  if (!brewery.accepting) return false;
  return brewery.items.some(
    (item) => itemAvailableCups(item) > 0 && item.ticketCost <= tickets,
  );
}

/** この蔵で頼める中で、いちばん安い 1 杯の枚数。頼めるものが無ければ null。 */
function cheapestCost(brewery: Brewery): number | null {
  const costs = brewery.items
    .filter((item) => itemAvailableCups(item) > 0)
    .map((item) => item.ticketCost);
  return costs.length > 0 ? Math.min(...costs) : null;
}

function BreweryRow({
  brewery,
  tickets,
  waiting,
}: {
  brewery: Brewery;
  tickets: number;
  waiting: number;
}) {
  const affordable = canOrderHere(brewery, tickets);
  const cheapest = cheapestCost(brewery);
  // 「売り切れ」と「チケットが足りない」は別の話なので、言い分けている。
  const soldOut = cheapest === null;
  const short = !soldOut && cheapest !== null && cheapest > tickets;

  return (
    <Link
      href={`/guest/breweries/${brewery.id}`}
      className={`flex w-full flex-col gap-3 rounded-card border border-hairline bg-card p-4 text-left transition-colors hover:border-hairline-strong ${
        affordable ? '' : 'opacity-55'
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[19px] tracking-[0.04em] text-ink">
            {brewery.name}
          </span>
          {[brewery.booth && `ブース ${brewery.booth}`, brewery.area].filter(Boolean).length > 0 && (
            <span className="text-[11.5px] leading-none text-ink-55">
              {[brewery.booth && `ブース ${brewery.booth}`, brewery.area]
                .filter(Boolean)
                .join(' ・ ')}
            </span>
          )}
        </div>
        <CrowdBadge level={crowdLevel(waiting)} closed={!brewery.accepting} />
      </div>

      {short && (
        <span className="w-fit rounded-full bg-terracotta/18 px-2.5 py-1.5 text-[11px] font-bold leading-none text-terracotta-soft">
          あと {cheapest! - tickets} ポイント あれば頼めます
        </span>
      )}
      {soldOut && brewery.items.length > 0 && (
        <span className="w-fit rounded-full bg-ink/10 px-2.5 py-1.5 text-[11px] font-bold leading-none text-ink-55">
          いま頼めるお酒がありません
        </span>
      )}

      {brewery.items.length > 0 && (
        <div className="flex w-full flex-col gap-1.5">
          {brewery.items.map((item) => {
            const left = itemAvailableCups(item);
            const enough = left > 0 && item.ticketCost <= tickets;
            return (
              <div
                key={item.id}
                className="flex items-baseline justify-between gap-2 rounded-[7px] bg-ink/7 px-2.5 py-2"
              >
                <span
                  className={`min-w-0 truncate text-[12px] leading-none ${
                    left === 0 ? 'text-ink-45 line-through' : 'text-ink-70'
                  }`}
                >
                  {item.name}
                </span>
                <span className="flex flex-none items-baseline gap-2 text-[11px] leading-none">
                  <span className={enough ? 'font-bold text-gold' : 'text-ink-45'}>
                    {item.ticketCost} ポイント
                  </span>
                  <span className={left === 0 ? 'text-terracotta-soft' : 'text-ink-45'}>
                    {left === 0 ? '完売' : `残${left}`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
