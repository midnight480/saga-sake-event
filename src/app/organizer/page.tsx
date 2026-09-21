'use client';

import { useState, useTransition } from 'react';

import { issueTickets } from '@/app/actions';
import {
  Button,
  Card,
  CrowdBadge,
  Empty,
  Eyebrow,
  Kpi,
  Notice,
  SectionLabel,
  StockBar,
  Title,
} from '@/components/ui';
import {
  batchForSale,
  breweryCupsLeft,
  breweryTotalCups,
  crowdLevel,
  isTicketShortage,
  itemCupsLeft,
  itemTotalCups,
  remainingPercent,
  staleAlerts,
  stockInTickets,
  waitingCount,
  type Brewery,
} from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** 運営ダッシュボード。会場の状態がここ 1 枚で分かるようにする。 */
export default function OrganizerDashboard() {
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (isInitialLoading || !snapshot) {
    return <Empty>会場の状態を読み込んでいます…</Empty>;
  }

  const { event, breweries, requests, batches, serverTime } = snapshot;
  const now = new Date(serverTime);

  const sameDay = batches.find((b) => b.id === 'same-day');
  const advance = batches.find((b) => b.id === 'advance');
  const sameDayForSale = sameDay ? batchForSale(sameDay) : 0;
  const stockTickets = stockInTickets(breweries);
  const shortage = isTicketShortage(sameDayForSale, stockTickets);
  const alerts = staleAlerts(requests, breweries, now);

  const totalLeft = breweries.reduce((sum, b) => sum + breweryCupsLeft(b), 0);
  const delivered = requests.filter((r) => r.status === 'delivered').length;
  const openCount = requests.filter(
    (r) => r.status === 'accepted' || r.status === 'preparing',
  ).length;

  const addDayTickets = () => {
    if (!sameDay) return;
    setMessage(null);
    startTransition(async () => {
      const result = await issueTickets(sameDay.id, 100);
      setMessage(result.ok ? '当日券を 100 枚 追加発行しました。' : result.reason);
      await refresh();
    });
  };

  return (
    <>
      <header className="flex items-end justify-between border-b border-hairline px-5 pt-5 pb-4">
        <div>
          <Eyebrow>LIVE</Eyebrow>
          <Title>運営ダッシュボード</Title>
        </div>
        <time className="text-[12px] text-ink-55">
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </time>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline">
        <Kpi label="出展蔵" value={`${breweries.length} / ${event.targetBreweryCount}`} unit="蔵" />
        <Kpi label="残り在庫" value={totalLeft} unit="杯" />
        <Kpi label="まだ売れる当日券" value={sameDayForSale} unit="枚" />
        <Kpi label="前売 未読取" value={advance ? batchForSale(advance) : 0} unit="枚" />
        <Kpi label="受渡完了" value={delivered} unit="件" />
        <Kpi label="対応待ち" value={openCount} unit="件" />
      </div>

      {message && (
        <div className="px-5 pt-4">
          <Notice tone="info">{message}</Notice>
        </div>
      )}

      {shortage && (
        <div className="px-5 pt-4">
          <Notice tone="warn" title="チケットだけが売り切れています">
            会場にはまだ <strong className="font-bold text-ink">{stockTickets}</strong>{' '}
            ポイント分の在庫があります。当日券を追加で刷れば、来場者はそのまま飲み続けられます。
            <Button tone="go" block className="mt-3" onClick={addDayTickets} disabled={pending}>
              {pending ? '発行しています…' : '当日券を100枚 追加で刷る'}
            </Button>
          </Notice>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="px-5 pt-4">
          <Notice tone="danger" title="応答遅延アラート">
            <ul className="flex flex-col gap-1.5">
              {alerts.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <SectionLabel>酒蔵別 在庫と混雑</SectionLabel>
      <div className="flex flex-col gap-2.5 px-5 pb-7">
        {breweries.length === 0 ? (
          <Empty>
            まだ酒蔵が登録されていません。
            <br />
            「蔵アカウント」から出展する蔵を追加してください。
          </Empty>
        ) : (
          breweries.map((brewery) => (
            <BreweryRow
              key={brewery.id}
              brewery={brewery}
              waiting={waitingCount(snapshot.waitingByBrewery, brewery.id)}
            />
          ))
        )}
      </div>
    </>
  );
}

function BreweryRow({ brewery, waiting }: { brewery: Brewery; waiting: number }) {
  const [open, setOpen] = useState(false);

  const left = breweryCupsLeft(brewery);
  const total = breweryTotalCups(brewery);
  const percent = remainingPercent(left, total);

  return (
    // 受付を止めている蔵は、一覧の中で埋もれさせない。会場では
    // 「止まっていることに気づかないまま時間が過ぎる」のがいちばん困る。
    <Card className={brewery.accepting ? undefined : 'border-amber/55 bg-amber/12'}>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14px] font-bold leading-snug text-ink">{brewery.name}</span>
          <span className="text-[11px] leading-none text-ink-55">
            {[brewery.booth, brewery.area].filter(Boolean).join(' ・ ') || '―'}
          </span>
        </div>
        <CrowdBadge level={crowdLevel(waiting)} closed={!brewery.accepting} />
      </div>

      {!brewery.accepting && (
        <p className="text-[12px] leading-[1.7] text-amber">
          この蔵は新しい注文を受け付けていません。蔵の画面から再開できます。
        </p>
      )}

      {/* 銘柄ごとに止めているもの（Issue #43）。一覧を閉じていても見えるように。 */}
      {brewery.accepting && brewery.items.some((i) => !i.accepting) && (
        <p className="text-[12px] leading-[1.7] text-amber">
          受付を止めている銘柄:{' '}
          {brewery.items
            .filter((i) => !i.accepting)
            .map((i) => i.name)
            .join('、')}
        </p>
      )}

      <StockBar percent={percent} />

      <div className="flex justify-between text-[11.5px] leading-none text-ink-55">
        <span className="whitespace-nowrap">
          残り {left} 杯 / {total} 杯
        </span>
        <span className="whitespace-nowrap">待ち {waiting} 件</span>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          {brewery.items.length === 0 ? (
            <span className="text-[12px] leading-[1.7] text-ink-55">
              この蔵はまだ銘柄を登録していません。
            </span>
          ) : (
            brewery.items.map((item) => {
              const itemLeft = itemCupsLeft(item);
              const itemTotal = itemTotalCups(item);
              return (
                <div key={item.id} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="min-w-0 font-display text-[15px] text-ink">
                      {item.name}
                      {!item.accepting && (
                        <span className="ml-2 align-middle font-sans text-[11px] text-amber">
                          受付停止中
                        </span>
                      )}
                    </span>
                    <span className="flex-none text-[11.5px] leading-none whitespace-nowrap text-ink-55">
                      残り {itemLeft} / {itemTotal} 杯
                    </span>
                  </div>
                  <StockBar percent={remainingPercent(itemLeft, itemTotal)} thin />
                  <div className="flex justify-between gap-2.5 text-[11px] leading-snug text-ink-45">
                    <span className="min-w-0">
                      {item.kind} / 精米 {item.polish}% / {item.size}
                    </span>
                    <span className="flex-none whitespace-nowrap text-gold">
                      {item.ticketCost} ポイント
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Button tone="flat" block onClick={() => setOpen((v) => !v)}>
        {open ? '銘柄をとじる ▲' : '銘柄ごとに見る ▼'}
      </Button>
    </Card>
  );
}
