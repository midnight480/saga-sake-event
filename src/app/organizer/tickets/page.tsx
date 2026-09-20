'use client';

import { useState, useTransition } from 'react';

import { issueTickets } from '@/app/actions';
import {
  Button,
  Card,
  Empty,
  Eyebrow,
  Note,
  Notice,
  ScreenHeader,
  StockBar,
  Title,
} from '@/components/ui';
import { batchForSale, type TicketBatch } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** STEP 3 ── チケットQRの発行。 */
export default function TicketsPage() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  return (
    <>
      <ScreenHeader>
        <Eyebrow>STEP 3</Eyebrow>
        <Title>チケットQRの発行</Title>
        <div className="mt-2">
          <Note>
            券種ごとにQRを刷って受付に置きます。支払いと金額はこのアプリでは扱いません。
            参加者が券のQRを読み取ると、その場で加算されます。
          </Note>
        </div>
      </ScreenHeader>

      <div className="flex flex-col gap-3 px-5 py-4">
        {snapshot.batches.map((batch) => (
          <BatchCard key={batch.id} batch={batch} />
        ))}
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-7 text-[11.5px] leading-[1.8] text-ink-55">
        <p>
          <span className="font-bold text-gold">減るタイミング</span>
          ：参加者がQRを読み取った瞬間に、その券が1枚消し込まれます。主催者側の操作は不要です。
        </p>
        <p>
          <span className="font-bold text-gold">完売</span>
          ：発行 − 読取済 が 0 になると自動で「完売」になり、参加者側の券種ボタンも押せなくなります。
          追加発行すればその場で再開します。
        </p>
        <p>
          読み取り済みのQRは無効になり、同じ券は二度使えません。1枚ずつ別のコードを印刷しているため、
          コピーした紙を何人もが使うことはできません。
        </p>
      </div>
    </>
  );
}

function BatchCard({ batch }: { batch: TicketBatch }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const forSale = batchForSale(batch);
  const percent = batch.issued > 0 ? Math.round((batch.redeemed / batch.issued) * 100) : 0;

  const issue = (count: number) => {
    setError(null);
    startTransition(async () => {
      const result = await issueTickets(batch.id, count);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  const saleSkin = !batch.canAdd
    ? 'bg-ink/9 text-ink-70'
    : forSale === 0
      ? 'bg-terracotta/20 text-terracotta-soft'
      : 'bg-matcha/16 text-matcha';

  const saleLabel = !batch.canAdd
    ? `未読取 ${forSale} 枚`
    : forSale === 0
      ? '完売'
      : `販売中 残 ${forSale}`;

  return (
    <Card>
      <div className="flex items-center gap-3.5">
        <div
          aria-hidden
          className="size-16 flex-none rounded-lg bg-ink"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg,#16221b 0 4px,transparent 4px 9px),repeating-linear-gradient(0deg,#16221b 0 4px,transparent 4px 9px)',
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[18px] text-ink">{batch.label}</span>
            <span
              className={`rounded-full px-2.5 py-1.5 text-[11.5px] font-bold leading-none whitespace-nowrap ${saleSkin}`}
            >
              {saleLabel}
            </span>
          </div>
          <span className="text-[11.5px] leading-snug text-ink-55">
            1枚で {batch.cupsPerTicket} 枚分のチケットになります
          </span>
          <div className="flex flex-wrap gap-2.5 text-[11.5px] leading-snug text-ink-55">
            <span className="whitespace-nowrap">発行 {batch.issued} 枚</span>
            <span className="whitespace-nowrap">読取済 {batch.redeemed} 枚</span>
          </div>
          <StockBar percent={percent} thin />
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex gap-2">
        {batch.canAdd && (
          <Button tone="ghost" className="flex-1" onClick={() => issue(50)} disabled={pending}>
            {pending ? '発行中…' : '＋50枚 発行'}
          </Button>
        )}
        <Button
          tone="gold"
          className="flex-1"
          onClick={() => window.open(`/organizer/tickets/print?batch=${batch.id}`, '_blank')}
          disabled={forSale === 0}
        >
          印刷用ページ
        </Button>
      </div>

      {!batch.canAdd && batch.issued === 0 && (
        <Notice tone="info">
          前売券はまだ 1 枚も発行されていません。前売の販売数が決まったら、
          この券種も追加発行できるよう主催者側で設定を変える必要があります。
          当面は「当日券」だけで運用できます。
        </Notice>
      )}
    </Card>
  );
}
