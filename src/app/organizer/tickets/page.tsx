'use client';

import { useState, useTransition } from 'react';

import { discardTickets, issueTickets } from '@/app/actions';
import {
  Button,
  Card,
  Chip,
  Empty,
  Eyebrow,
  Field,
  Note,
  Notice,
  ScreenHeader,
  StockBar,
  Stepper,
  Title,
  inputClass,
} from '@/components/ui';
import { batchForSale, type TicketBatch } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** STEP 3 ── チケットQRの発行。 */
export default function TicketsPage() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const total = snapshot.batches.reduce((sum, b) => sum + b.issued, 0);

  return (
    <>
      <ScreenHeader>
        <Eyebrow>STEP 3</Eyebrow>
        <Title>チケットQRの発行</Title>
        <div className="mt-2">
          <Note>
            券種ごとに、何枚 刷るかを決めて印刷します。支払いと金額はこのアプリでは扱いません。
            参加者が券のQRを読み取ると、その場でポイントが入ります。
          </Note>
        </div>
      </ScreenHeader>

      {total === 0 && (
        <div className="px-5 pt-4">
          <Notice tone="info" title="まだ 1 枚も刷られていません">
            先に「イベント設定」で
            <strong className="font-bold text-ink">1 枚で渡すポイント</strong>を決めてから、
            ここで必要な枚数を刷ってください。前売を使わない場合は、当日券だけで運用できます。
          </Notice>
        </div>
      )}

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
          ：発行 − 読取済 が 0 になると自動で「完売」になります。追加発行すればその場で再開します。
        </p>
        <p>
          読み取り済みのQRは無効になり、同じ券は二度使えません。1枚ずつ別のコードを印刷しているため、
          コピーした紙を何人もが使うことはできません。
        </p>
      </div>
    </>
  );
}

/** よく使う発行枚数。これ以外は自分で入力できる。 */
const QUICK_COUNTS = [10, 50, 100, 300];

function BatchCard({ batch }: { batch: TicketBatch }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [count, setCount] = useState(50);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const forSale = batchForSale(batch);
  const percent = batch.issued > 0 ? Math.round((batch.redeemed / batch.issued) * 100) : 0;

  const act = (fn: () => Promise<{ ok: boolean; reason?: string }>, message: string) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setDone(message);
      else setError(result.reason ?? '失敗しました。');
      await refresh();
    });
  };

  const saleSkin =
    batch.issued === 0
      ? 'bg-ink/9 text-ink-55'
      : forSale === 0
        ? 'bg-terracotta/20 text-terracotta-soft'
        : 'bg-matcha/16 text-matcha';

  const saleLabel =
    batch.issued === 0 ? '未発行' : forSale === 0 ? '完売' : `販売中 残 ${forSale}`;

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
          <div className="flex flex-wrap gap-2.5 text-[11.5px] leading-snug text-ink-55">
            <span className="whitespace-nowrap">発行 {batch.issued} 枚</span>
            <span className="whitespace-nowrap">読取済 {batch.redeemed} 枚</span>
          </div>
          <StockBar percent={percent} thin />
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="info">{done}</Notice>}

      <div className="flex items-baseline justify-between gap-2 border-t border-hairline pt-3 text-[11.5px] leading-none">
        <span className="text-ink-55">1 枚で渡すポイント</span>
        <span className="text-ink">
          <span className="font-bold text-gold">{batch.cupsPerTicket}</span> ポイント
        </span>
      </div>
      <p className="-mt-1 text-[11px] leading-[1.6] text-ink-45">
        ポイント数は「イベント設定」の画面で変えられます。
      </p>

      {/* ── 発行する枚数 ── */}
      <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
        <span className="text-[11.5px] leading-none tracking-[0.08em] text-ink-55">
          何枚 発行しますか
        </span>
        <div className="flex flex-wrap gap-2">
          {QUICK_COUNTS.map((n) => (
            <Chip key={n} active={count === n} className="flex-1" onClick={() => setCount(n)}>
              {n}枚
            </Chip>
          ))}
        </div>
        <input
          type="number"
          min={1}
          max={2000}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
          aria-label="発行する枚数"
          className={inputClass}
        />
        <Button
          tone="go"
          block
          onClick={() => act(() => issueTickets(batch.id, count), `${count} 枚 発行しました。`)}
          disabled={pending}
        >
          {pending ? '発行しています…' : `${batch.label}を ${count} 枚 発行する`}
        </Button>
      </div>

      {/* ── 印刷・取り消し ── */}
      <div className="flex gap-2 border-t border-hairline pt-3">
        <Button
          tone="gold"
          className="flex-1"
          onClick={() => window.open(`/organizer/tickets/print?batch=${batch.id}`, '_blank')}
          disabled={forSale === 0}
        >
          印刷用ページ
        </Button>
        {batch.issued > 0 && batch.redeemed === 0 && (
          <Button tone="flat" className="flex-1" onClick={() => setConfirmDiscard(true)}>
            発行した券を取り消す
          </Button>
        )}
      </div>

      {confirmDiscard && (
        <div className="flex flex-col gap-2.5 rounded-field border border-terracotta/50 bg-terracotta/12 p-3.5">
          <span className="text-[12.5px] leading-[1.7] text-ink/90">
            発行済みの {forSale} 枚を取り消します。すでに印刷した紙は使えなくなります。
          </span>
          <div className="flex gap-2">
            <Button tone="ghost" className="flex-1" onClick={() => setConfirmDiscard(false)}>
              やめる
            </Button>
            <Button
              tone="danger"
              className="flex-1"
              disabled={pending}
              onClick={() => {
                setConfirmDiscard(false);
                act(() => discardTickets(batch.id), '発行した券を取り消しました。');
              }}
            >
              取り消す
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
