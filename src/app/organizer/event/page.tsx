'use client';

import { useEffect, useState, useTransition } from 'react';

import { saveEvent, setPhase, setTicketCount } from '@/app/actions';
import {
  Button,
  Card,
  Empty,
  Eyebrow,
  Field,
  Note,
  Notice,
  ScreenHeader,
  SectionLabel,
  Stepper,
  Title,
  inputClass,
} from '@/components/ui';
import type { TicketBatch } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** STEP 1 ── イベントの日付・時刻・規模を決める。 */
export default function EventSettingsPage() {
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 入力中に 4 秒ごとのポーリングで値が戻ってしまわないよう、
  // 編集内容はいったん手元に持つ。
  const [draft, setDraft] = useState<{
    eventDate: string;
    startTime: string;
    endTime: string;
    targetBreweryCount: number;
  } | null>(null);

  useEffect(() => {
    if (snapshot && !draft) {
      setDraft({
        eventDate: snapshot.event.eventDate,
        startTime: snapshot.event.startTime,
        endTime: snapshot.event.endTime,
        targetBreweryCount: snapshot.event.targetBreweryCount,
      });
    }
  }, [snapshot, draft]);

  if (isInitialLoading || !snapshot || !draft) {
    return <Empty>読み込んでいます…</Empty>;
  }

  const { event, breweries } = snapshot;
  const registered = breweries.length;
  const unregistered = Math.max(0, draft.targetBreweryCount - registered);
  const isOpen = event.phase === 'open';

  const commit = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveEvent(next);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.reason);
      }
      await refresh();
    });
  };

  const togglePhase = () => {
    setError(null);
    startTransition(async () => {
      const result = await setPhase(isOpen ? 'closed' : 'open');
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <>
      <ScreenHeader>
        <Eyebrow>STEP 1</Eyebrow>
        <Title>イベント設定</Title>
      </ScreenHeader>

      <div className="flex flex-col gap-5 px-5 py-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {saved && !error && !pending && (
          <p className="text-[11.5px] leading-none text-matcha">保存しました。</p>
        )}

        <Field label="開催日">
          <input
            type="date"
            value={draft.eventDate}
            onChange={(e) => commit({ eventDate: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="開始時刻">
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => commit({ startTime: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="終了時刻">
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => commit({ endTime: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        <Field
          label="参加酒蔵数"
          hint={`登録済 ${registered} 蔵 / 未登録 ${unregistered} 蔵`}
        >
          <div className="rounded-field border border-hairline-strong bg-card px-3.5 py-2.5">
            <Stepper
              label="参加酒蔵数"
              unit="蔵"
              value={draft.targetBreweryCount}
              onDecrease={() =>
                commit({ targetBreweryCount: Math.max(1, draft.targetBreweryCount - 1) })
              }
              onIncrease={() => commit({ targetBreweryCount: draft.targetBreweryCount + 1 })}
              decreaseDisabled={draft.targetBreweryCount <= Math.max(1, registered)}
            />
          </div>
        </Field>

      </div>

      <SectionLabel>用意するチケット</SectionLabel>
      <div className="flex flex-col gap-3 px-5">
        <Note>
          券種ごとに何枚 用意するかを決めます。その枚数の QR が発行され、
          「チケットQR」の画面から印刷できます。
        </Note>
        {snapshot.batches.map((batch) => (
          <TicketPlan key={batch.id} batch={batch} />
        ))}
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-3 border-t border-hairline pt-5">
          <Note>開始時刻を過ぎるまで、参加者はリクエストを送れません。</Note>
          <Button
            tone={isOpen ? 'flat' : 'go'}
            block
            onClick={togglePhase}
            disabled={pending}
            className={isOpen ? 'border-forest bg-forest text-ink' : undefined}
          >
            {isOpen ? 'イベントを終了する' : 'イベントを開始する（受付解禁）'}
          </Button>
          {!isOpen && registered === 0 && (
            <Notice tone="info">
              先に「蔵アカウント」で出展する酒蔵を登録してください。蔵が 0 のままイベントを開始すると、
              参加者は注文する相手がいない状態になります。
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 券種ごとに「何枚 用意するか」だけを決める。
 *
 * 入力は「あと何枚 足すか」ではなく総数。主催者が考えているのは
 * 「前売を 300 枚」であって差分ではないので、引き算はこちらでやる。
 *
 * 1 枚が何枚分になるかは、ここでは扱わない。決めることが 2 つあると
 * どちらを入れる欄か分からなくなるため、「チケットQR」の画面に寄せている。
 */
function TicketPlan({ batch }: { batch: TicketBatch }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [target, setTarget] = useState(batch.issued);

  const changed = target !== batch.issued;

  const apply = () => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await setTicketCount(batch.id, target);
      if (!result.ok) setError(result.reason);
      else if (result.value) {
        const { added, removed } = result.value;
        if (added > 0) setDone(`${added} 枚 追加しました。`);
        else if (removed > 0) setDone(`${removed} 枚 減らしました。`);
      }
      await refresh();
    });
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[18px] text-ink">{batch.label}</span>
        <span className="text-[11.5px] leading-none text-ink-55">
          いま {batch.issued} 枚（読取済 {batch.redeemed} 枚）
        </span>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="info">{done}</Notice>}

      <div className="flex items-stretch gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={batch.redeemed}
          max={5000}
          value={target}
          onChange={(e) => setTarget(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
          aria-label={`${batch.label}を何枚 用意するか`}
          className={`${inputClass} flex-1 text-right text-[20px]`}
        />
        <span className="flex flex-none items-center text-[13px] text-ink-55">枚</span>
        <Button tone="go" className="flex-none px-5" onClick={apply} disabled={pending || !changed}>
          {pending ? '…' : '用意する'}
        </Button>
      </div>

    </Card>
  );
}
