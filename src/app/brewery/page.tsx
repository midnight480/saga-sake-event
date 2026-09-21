'use client';

import { useState, useTransition } from 'react';

import { setAccepting, setBrandAccepting, setRequestStatus } from '@/app/actions';
import { Button, Card, Empty, Eyebrow, Notice, StatusBadge, Title } from '@/components/ui';
import {
  STATUS_FLOW,
  itemAvailableCups,
  minutesSince,
  waitingCount,
  type Item,
  type OrderRequest,
  type RequestStatus,
} from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

import { useBreweryContext } from './shell';

/** 受付キュー。当日、蔵の担当者がいちばん長く見る画面。 */
export default function BreweryQueuePage() {
  const { breweryId } = useBreweryContext();
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const brewery = snapshot.breweries.find((b) => b.id === breweryId);
  if (!brewery) return <Empty>この蔵の情報が見つかりませんでした。</Empty>;

  // 終わった注文も残すが、対応が必要なものを上に出す。
  const queue = snapshot.requests
    .filter((r) => r.breweryId === breweryId)
    .sort((a, b) => {
      const aOpen = !!STATUS_FLOW[a.status];
      const bOpen = !!STATUS_FLOW[b.status];
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const waiting = waitingCount(snapshot.waitingByBrewery, breweryId);

  const toggleAccepting = () => {
    setError(null);
    startTransition(async () => {
      const result = await setAccepting(!brewery.accepting, breweryId);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-hairline px-5 pt-5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow>{brewery.name}</Eyebrow>
            <Title>受付キュー</Title>
          </div>
          <div className="flex-none text-right">
            <span className="font-display text-[26px] text-amber">{waiting}</span>
            <span className="ml-1 text-[11px] text-ink-55">件 対応待ち</span>
          </div>
        </div>
        <Button
          tone={brewery.accepting ? 'flat' : 'danger'}
          block
          onClick={toggleAccepting}
          disabled={pending}
          className={
            brewery.accepting
              ? undefined
              : 'border-terracotta/60 bg-terracotta/18 text-terracotta-soft hover:bg-terracotta/28'
          }
        >
          {brewery.accepting ? '新規リクエストを一時停止する' : '受付を再開する'}
        </Button>
        {!brewery.accepting && (
          <Notice tone="warn">
            いま受付を止めています。参加者の画面には「受付停止中」と出て、注文できません。
          </Notice>
        )}

        {brewery.items.length > 0 && <ItemAccepting items={brewery.items} onRefresh={refresh} />}
      </header>

      {error && (
        <div className="px-5 pt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 py-4">
        {queue.length === 0 ? (
          <Empty>
            まだリクエストはありません。
            <br />
            参加者がブース前で注文すると、ここに並びます。
          </Empty>
        ) : (
          queue.map((request) => (
            <QueueCard
              key={request.id}
              request={request}
              now={new Date(snapshot.serverTime)}
              onRefresh={refresh}
            />
          ))
        )}
      </div>
    </>
  );
}

/**
 * 銘柄ごとの受付（Issue #43）。
 *
 * 蔵全体を止めるほどではないが、この銘柄だけ止めたい、という場面がある
 * （瓶を開け直している、冷やし直している、など）。止めても、すでに受けた
 * 注文はそのまま渡せる。受付キューが主役の画面なので、一覧は開いたときだけ
 * 出す。止めている銘柄があれば、閉じていても分かるようにしておく。
 */
function ItemAccepting({ items, onRefresh }: { items: Item[]; onRefresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const paused = items.filter((i) => !i.accepting);

  return (
    <div className="flex flex-col gap-2">
      {paused.length > 0 && (
        <Notice tone="warn">
          {paused.map((i) => i.name).join('、')} の受付を止めています。
        </Notice>
      )}

      {open && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <ItemAcceptingRow key={item.id} item={item} onRefresh={onRefresh} />
          ))}
        </div>
      )}

      <Button tone="flat" block onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? '銘柄ごとの受付をとじる ▲' : '銘柄ごとに受付を止める ▼'}
      </Button>
    </div>
  );
}

function ItemAcceptingRow({ item, onRefresh }: { item: Item; onRefresh: () => Promise<unknown> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const soldOut = itemAvailableCups(item) === 0;

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setBrandAccepting(item.id, !item.accepting);
      if (!result.ok) setError(result.reason);
      await onRefresh();
    });
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-field border px-3.5 py-2.5 ${
        item.accepting ? 'border-hairline bg-card' : 'border-amber/50 bg-amber/10'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[13.5px] leading-snug text-ink">{item.name}</span>
          <span
            className={`text-[11px] leading-none ${item.accepting ? 'text-matcha' : 'text-amber'}`}
          >
            {item.accepting ? '受付中' : '受付停止中'}
            {soldOut && <span className="text-ink-45"> ・ 完売</span>}
          </span>
        </div>
        <Button
          tone={item.accepting ? 'ghost' : 'go'}
          className="flex-none"
          onClick={toggle}
          disabled={pending}
        >
          {pending ? '…' : item.accepting ? '止める' : '再開する'}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

function QueueCard({
  request,
  now,
  onRefresh,
}: {
  request: OrderRequest;
  now: Date;
  onRefresh: () => Promise<unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const actions = STATUS_FLOW[request.status] ?? [];
  const ago = minutesSince(request.createdAt, now);

  const advance = (to: RequestStatus) => {
    setError(null);
    startTransition(async () => {
      const result = await setRequestStatus(request.id, to);
      if (!result.ok) setError(result.reason);
      await onRefresh();
    });
  };

  return (
    <Card animate>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-display text-[18px] tracking-[0.04em] text-ink">
            {request.brand}
          </span>
          <span className="text-[11.5px] leading-none text-ink-55">
            {request.guestLabel} ・ {request.cups}杯 ・ {ago}分前
          </span>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
          {actions.map((action) => (
            <Button
              key={action.to}
              tone={action.tone}
              className="flex-1"
              onClick={() => advance(action.to)}
              disabled={pending}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
