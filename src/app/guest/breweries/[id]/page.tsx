'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { order } from '@/app/actions';
import {
  Button,
  Card,
  Empty,
  LeftBadge,
  Notice,
  Stepper,
  Title,
} from '@/components/ui';
import {
  MAX_CUPS_PER_REQUEST,
  STATUS_LABEL,
  itemAvailableCups,
  orderingStatus,
  undeliveredRequestOf,
  waitingCount,
  type Item,
} from '@/lib/domain';
import { TasteTags } from '@/components/TasteTags';
import { unlockSound } from '@/lib/sound';
import { useSnapshot } from '@/lib/useSnapshot';

/** 銘柄を選ぶ。ブースの前で開く画面。 */
export default function GuestBreweryDetailPage() {
  const params = useParams<{ id: string }>();
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const brewery = snapshot.breweries.find((b) => b.id === params.id);
  if (!brewery) {
    return (
      <Empty>
        この酒蔵は見つかりませんでした。
        <br />
        <Link href="/guest/breweries">酒蔵一覧に戻る</Link>
      </Empty>
    );
  }

  const waiting = waitingCount(snapshot.waitingByBrewery, brewery.id);
  // 受付が閉じている理由まで見て、参加者に伝える言葉を変える。
  const status = orderingStatus(snapshot.event, new Date(snapshot.serverTime));
  const guest = snapshot.guest;

  // 受け取っていない注文があるうちは、次を頼めない（Issue #34）。
  // サーバー側（place_order）でも止めるが、押してから断られるより、
  // 先に理由と行き先を見せたほうが迷わない。
  const undelivered = guest ? undeliveredRequestOf(snapshot.requests, guest.clerkUserId) : null;
  const undeliveredAt = undelivered
    ? snapshot.breweries.find((b) => b.id === undelivered.breweryId)?.name
    : undefined;

  return (
    <>
      <header className="border-b border-hairline px-5 pt-4 pb-4">
        <Link
          href="/guest/breweries"
          className="inline-flex min-h-11 items-center text-[12.5px] text-ink-55 hover:text-ink"
        >
          ← 酒蔵一覧
        </Link>
        <Title size="lg">{brewery.name}</Title>
        <div className="mt-1.5 text-[12px] leading-[1.7] text-ink-55">
          {[brewery.booth && `ブース ${brewery.booth}`, brewery.area, `待ち ${waiting} 件`]
            .filter(Boolean)
            .join(' ・ ')}
        </div>
        {guest && (
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-[24px] leading-none text-gold">
              {guest.tickets}
            </span>
            <span className="text-[12px] text-ink-55">ポイント 持っています</span>
          </div>
        )}
      </header>

      {!status.open && (
        <div className="px-5 pt-4">
          <Notice tone="info">
            {status.manual
              ? 'いま主催者が受付を止めています。再開までお待ちください。'
              : status.label === '終了'
                ? 'イベントは終了しました。'
                : `${snapshot.event.startTime} の開始までリクエストは送れません。`}
          </Notice>
        </div>
      )}

      {!brewery.accepting && (
        <div className="px-5 pt-4">
          <Notice tone="danger">この蔵は現在 受付を停止しています。</Notice>
        </div>
      )}

      {undelivered && (
        <div className="px-5 pt-4">
          <Notice tone="info" title="まだ受け取っていないリクエストがあります">
            {undeliveredAt ? `${undeliveredAt}の` : ''}
            <strong className="font-bold text-ink">{undelivered.brand}</strong>（
            {STATUS_LABEL[undelivered.status]}）を受け取ると、次のリクエストを出せます。
            <br />
            <Link href="/guest" className="underline">
              マイページで様子を見る
            </Link>
          </Notice>
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 py-4">
        {brewery.items.length === 0 ? (
          <Empty>この蔵はまだ銘柄を登録していません。</Empty>
        ) : (
          brewery.items.map((item) => (
            <OrderCard
              key={item.id}
              item={item}
              tickets={guest?.tickets ?? 0}
              blocked={!status.open || !brewery.accepting || !!undelivered}
              blockedReason={
                !status.open ? status.label : !brewery.accepting ? '受付停止中' : '受け取り待ちです'
              }
            />
          ))
        )}
      </div>
    </>
  );
}

function OrderCard({
  item,
  tickets,
  blocked,
  blockedReason,
}: {
  item: Item;
  tickets: number;
  blocked: boolean;
  blockedReason: string;
}) {
  const router = useRouter();
  const { refresh } = useSnapshot();
  const [cups, setCups] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 他の人がすでに注文して受け取っていない分を引いた「いま頼める杯数」。
  // ここを物理的な残りにすると、最後の数杯で注文が弾かれる理由が分からなくなる。
  const left = itemAvailableCups(item);
  const need = item.ticketCost * cups;
  const soldOut = left === 0;
  // 蔵がこの銘柄だけ止めている（Issue #43）。完売とは言い分ける。
  // 在庫はあるので、しばらくすれば頼めるようになるかもしれない。
  const paused = !item.accepting;
  const notEnough = need > tickets;
  const canOrder = !blocked && !soldOut && !paused && !notEnough && cups <= left;

  const label = soldOut
    ? '完売'
    : paused
      ? 'この銘柄は受付停止中'
      : blocked
        ? blockedReason
        : notEnough
          ? `あと ${need - tickets} ポイント 必要です`
          : `${need} ポイントでリクエスト`;

  const submit = () => {
    setError(null);
    // この押した瞬間に、音を鳴らせる状態にしておく（Issue #58）。できあがりの知らせは
    // このあとで届くので、ここで開けておけば最初のできあがりから鳴る。
    void unlockSound();
    startTransition(async () => {
      const result = await order(item.id, cups);
      if (!result.ok) {
        setError(result.reason);
        await refresh();
        return;
      }
      // 送ったあとに見たいのは、この銘柄ではなく自分の注文の進み具合。
      // 画面に留めると、間違えてもう一度押してしまうことにもなる。
      await refresh();
      router.push('/guest');
    });
  };

  return (
    <Card className={soldOut || paused ? 'opacity-50' : undefined}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-display text-[20px] tracking-[0.04em] text-ink">{item.name}</span>
          <span className="text-[11.5px] leading-[1.6] text-ink-55">
            {item.kind} / 精米 {item.polish}% ・ {item.size}
          </span>
          {/* 初めての人の手がかり（Issue #40）。蔵が選んだ・書いたものだけ出す。 */}
          <TasteTags item={item} />
          <span
            className={`text-[11.5px] leading-none font-bold whitespace-nowrap ${
              item.ticketCost <= tickets ? 'text-gold' : 'text-terracotta-soft'
            }`}
          >
            1 杯 {item.ticketCost} ポイント
            {item.ticketCost > tickets && '（足りません）'}
          </span>
        </div>
        <LeftBadge left={left} />
      </div>

      {item.description && (
        <p className="text-[12.5px] leading-[1.8] whitespace-pre-line text-ink-70">
          {item.description}
        </p>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
        <Stepper
          label="杯数"
          unit="杯"
          value={cups}
          onDecrease={() => setCups((v) => Math.max(1, v - 1))}
          onIncrease={() => setCups((v) => Math.min(MAX_CUPS_PER_REQUEST, Math.min(left || 1, v + 1)))}
          decreaseDisabled={cups <= 1}
          increaseDisabled={cups >= Math.min(MAX_CUPS_PER_REQUEST, left || 1)}
        />
        <p className="-mt-1 text-center text-[11px] leading-none text-ink-45">
          一度に頼めるのは {MAX_CUPS_PER_REQUEST} 杯までです
        </p>
        <Button
          tone="go"
          block
          className="min-h-[52px] text-[14px]"
          onClick={submit}
          disabled={!canOrder || pending}
        >
          {pending ? '送信しています…' : label}
        </Button>
        {notEnough && !soldOut && !paused && !blocked && (
          <Link
            href="/guest/charge"
            className="text-center text-[11.5px] leading-none text-gold underline"
          >
            ポイントを追加する
          </Link>
        )}
      </div>
    </Card>
  );
}
