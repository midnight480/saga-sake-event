'use client';

import { useState } from 'react';

import {
  Empty,
  Eyebrow,
  Note,
  ScreenHeader,
  SectionLabel,
  StatusBadge,
  Title,
} from '@/components/ui';
import {
  conquestOf,
  formatJstDateTime,
  requestsOf,
  titleOf,
  type BreweryConquest,
  type TitleStatus,
} from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 記録。どの蔵・どの銘柄をどれだけ飲んだかと、注文の履歴（Issue #30, #32）。
 *
 * マイページにも自分の注文は並んでいるが、あちらは「いま取りに行くべきもの」を
 * 見るための画面。こちらは振り返るための画面なので、受け取り終えたものや
 * キャンセルも含めて、時刻つきで全部並べる。
 */
export default function GuestRecordPage() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const guest = snapshot.guest;
  if (!guest) return <Empty>参加者の情報が読み込めませんでした。画面を更新してください。</Empty>;

  const conquest = conquestOf(snapshot.breweries, snapshot.requests, guest.clerkUserId);
  const history = requestsOf(snapshot.requests, guest.clerkUserId);
  const nameOf = (id: string) => snapshot.breweries.find((b) => b.id === id)?.name ?? '―';

  return (
    <>
      <ScreenHeader>
        <Eyebrow>RECORD</Eyebrow>
        <Title>記録</Title>
        <div className="mt-2">
          <Note>受け取ったお酒だけを「制覇」として数えます。</Note>
        </div>
      </ScreenHeader>

      {/* ── 称号（Issue #52）── */}
      <TitleCard status={titleOf(conquest)} />

      {/* ── 制覇のまとめ ── */}
      <div className="grid grid-cols-3 gap-2 px-5 pt-4">
        <Stat label="蔵" value={conquest.breweriesVisited} total={conquest.breweries.length} />
        <Stat label="銘柄" value={conquest.itemsConquered} total={conquest.itemsTotal} />
        <Stat label="杯" value={conquest.cups} />
      </div>

      <SectionLabel>酒蔵ごとの制覇（押すと銘柄が開きます）</SectionLabel>
      <div className="flex flex-col gap-2 px-5">
        {conquest.breweries.length === 0 ? (
          <Empty>まだ銘柄を登録している蔵がありません。</Empty>
        ) : (
          conquest.breweries.map((b) => <BreweryRow key={b.brewery.id} conquest={b} />)
        )}
      </div>

      <SectionLabel>注文の履歴（新しい順）</SectionLabel>
      <div className="flex flex-col gap-2 px-5 pb-6">
        {history.length === 0 ? (
          <Empty>
            まだ注文はありません。
            <br />
            「酒蔵をさがす」から銘柄を選んでください。
          </Empty>
        ) : (
          history.map((request) => (
            <div
              key={request.id}
              className="flex items-center gap-3 rounded-field border border-hairline bg-card px-3.5 py-3"
            >
              <span className="w-[74px] flex-none font-mono text-[12px] leading-none text-ink-55">
                {formatJstDateTime(request.createdAt)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[13.5px] leading-snug text-ink">{request.brand}</span>
                <span className="truncate text-[11px] leading-none text-ink-45">
                  {nameOf(request.breweryId)} ・ {request.cups} 杯 ・ {request.ticketCost} ポイント
                </span>
              </div>
              <StatusBadge status={request.status} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Stat({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card border border-hairline bg-card px-2 py-3">
      <span className="whitespace-nowrap">
        <span className="font-display text-[26px] leading-none text-gold">{value}</span>
        {total !== undefined && (
          <span className="text-[12px] text-ink-45"> / {total}</span>
        )}
      </span>
      <span className="text-[11px] leading-none text-ink-55">{label}</span>
    </div>
  );
}

/**
 * 酒蔵ごとの制覇。初めは蔵名と「何銘柄中いくつ」だけを並べ、銘柄は畳む（Issue #46）。
 *
 * 参加者がまず知りたいのは「どれだけ制覇したか」。銘柄まで全部並べると、
 * 蔵が多いほど縦に長くなって全体が見渡せない。蔵の行を押すと、その蔵の銘柄が開く。
 * 開閉のボタンを別に置くと 1 蔵ごとに行が増えるので、行そのものを押せるようにした。
 */
function BreweryRow({ conquest }: { conquest: BreweryConquest }) {
  const { brewery, items, conquered } = conquest;
  const [open, setOpen] = useState(false);
  const percent = items.length > 0 ? Math.round((conquered / items.length) * 100) : 0;
  const complete = conquered === items.length;

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-ink/5"
      >
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-display text-[16px] text-ink">{brewery.name}</span>
          <span className="flex flex-none items-baseline gap-2 whitespace-nowrap">
            <span
              className={`text-[12px] leading-none ${complete ? 'font-bold text-gold' : 'text-ink-55'}`}
            >
              {complete ? '制覇！ ' : ''}
              {conquered} / {items.length} 銘柄
            </span>
            <span aria-hidden className="text-[10px] leading-none text-ink-45">
              {open ? '▲' : '▼'}
            </span>
          </span>
        </span>

        {/* 在庫の StockBar は「残りが少ないと赤」の意味なので使わない。進み具合は金一色。 */}
        <span
          className="block h-1.5 w-full overflow-hidden rounded-sm bg-ink/10"
          role="img"
          aria-label={`${items.length} 銘柄中 ${conquered} 銘柄`}
        >
          <span className="block h-full rounded-sm bg-gold" style={{ width: `${percent}%` }} />
        </span>
      </button>

      {open && (
        <ul className="flex flex-col gap-1.5 border-t border-hairline px-4 py-3">
          {items.map(({ item, cups }) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className={`min-w-0 truncate ${cups > 0 ? 'text-ink' : 'text-ink-45'}`}>
                <span aria-hidden className={cups > 0 ? 'text-gold' : 'text-ink-45'}>
                  {cups > 0 ? '✓ ' : '・ '}
                </span>
                {item.name}
              </span>
              <span className="flex-none text-[11.5px] leading-none text-ink-55">
                {cups > 0 ? `${cups} 杯` : 'まだ'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * いまの称号と、次の称号までの道のり（Issue #52）。
 *
 * 記録を開くたびに「あと何銘柄で上がるか」が見えるよう、画面のいちばん上に置く。
 * 自分の結果として SNS に載せてもらえるよう、これだけで何者か分かる大きさにした。
 */
function TitleCard({ status }: { status: TitleStatus }) {
  const { rank, next, specials } = status;
  return (
    <div className="px-5 pt-4">
      <div className="flex flex-col gap-3 rounded-card border border-gold/45 bg-linear-to-b from-gold/12 to-card p-4">
        <span className="text-[11px] leading-none tracking-[0.2em] text-ink-55">いまの称号</span>
        <div className="flex flex-col gap-1">
          {rank.reading && (
            <span className="text-[11px] leading-none tracking-[0.1em] text-ink-45">{rank.reading}</span>
          )}
          <span className="font-display text-[34px] leading-tight tracking-[0.08em] text-gold-bright">
            {rank.name}
          </span>
          <span className="text-[12.5px] leading-[1.7] text-ink-70">{rank.description}</span>
        </div>

        {next && (
          <p className="border-t border-hairline pt-2.5 text-[12px] leading-[1.7] text-ink-70">
            次の称号「<strong className="font-bold text-ink">{next.rank.name}</strong>」まで、あと{' '}
            <strong className="font-display text-[18px] text-gold">{next.remaining}</strong> 銘柄
          </p>
        )}

        {/* 特別な称号。取れていないものも、目標として薄く見せる。 */}
        <div className="flex flex-wrap gap-2">
          {specials.map((title) => (
            <div
              key={title.id}
              className={`flex flex-col gap-1 rounded-field border px-3 py-2 ${
                title.earned ? 'border-gold/60 bg-gold/14' : 'border-hairline bg-ink/5'
              }`}
            >
              <span
                className={`text-[13px] leading-none font-bold ${title.earned ? 'text-gold-bright' : 'text-ink-45'}`}
              >
                {title.earned ? '★ ' : '☆ '}
                {title.name}
                <span className="sr-only">{title.earned ? '（取得済み）' : '（まだ）'}</span>
              </span>
              <span className="text-[11px] leading-snug text-ink-55">
                {title.earned ? title.detail : `${title.description}（${title.detail}）`}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[10.5px] leading-[1.6] text-ink-45">
          称号は受け取ったお酒の銘柄の数で上がります。お水もはさみながら、ご自分のペースでどうぞ。
        </p>
      </div>
    </div>
  );
}
