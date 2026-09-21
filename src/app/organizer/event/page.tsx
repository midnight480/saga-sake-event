'use client';

import { useEffect, useState, useTransition } from 'react';

import { saveEvent, setCupsPerTicket, setPhase, setTicketCount } from '@/app/actions';
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
import { batchForSale, type TicketBatch } from '@/lib/domain';
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
          券種ごとに「1 枚で何枚分になるか」と「何枚 用意するか」を決めます。
          ここで決めた枚数の QR が発行され、「チケットQR」の画面から印刷できます。
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
 * 券種ごとの計画。
 *
 * 「あと何枚 足すか」ではなく「何枚 用意するか」を入れてもらう。
 * 主催者が考えているのは総数であって差分ではないので、引き算はこちらでやる。
 */
function TicketPlan({ batch }: { batch: TicketBatch }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [target, setTarget] = useState(batch.issued);
  const [cups, setCups] = useState(batch.cupsPerTicket);

  // 発行してしまうと配った券の価値まで変わるので、1 枚も無いときだけ変えられる。
  const canChangeCups = batch.issued === 0;
  const redeemed = batch.redeemed;

  const act = (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setSaved(true);
      else setError(result.reason ?? '変更できませんでした。');
      await refresh();
    });
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[18px] text-ink">{batch.label}</span>
        <span className="text-[11.5px] leading-none text-ink-55">
          発行 {batch.issued} 枚 / 読取済 {redeemed} 枚
        </span>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <Field
        label="この券 1 枚で、チケット何枚分にするか"
        hint={
          canChangeCups
            ? '1 杯あたり 1〜3 枚です。10 枚なら、おおよそ 4〜10 杯 楽しめます。'
            : 'すでに発行した券があるため変更できません。'
        }
      >
        <div className="rounded-field border border-hairline-strong bg-card px-3.5 py-2.5">
          <Stepper
            label="チケット枚数"
            unit="枚分"
            value={cups}
            onDecrease={() =>
              act(async () => {
                const next = Math.max(1, cups - 1);
                const r = await setCupsPerTicket(batch.id, next);
                if (r.ok) setCups(next);
                return r;
              })
            }
            onIncrease={() =>
              act(async () => {
                const next = cups + 1;
                const r = await setCupsPerTicket(batch.id, next);
                if (r.ok) setCups(next);
                return r;
              })
            }
            decreaseDisabled={!canChangeCups || pending || cups <= 1}
            increaseDisabled={!canChangeCups || pending}
          />
        </div>
      </Field>

      <Field
        label="何枚 用意するか"
        hint={`${target} 枚 用意すると、来場者 ${target} 人分・チケット ${target * cups} 枚分になります。`}
      >
        <input
          type="number"
          min={redeemed}
          max={5000}
          value={target}
          onChange={(e) => setTarget(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
          aria-label={`${batch.label}を何枚用意するか`}
          className={inputClass}
        />
      </Field>

      <Button
        tone="go"
        block
        onClick={() => act(() => setTicketCount(batch.id, target))}
        disabled={pending || target === batch.issued}
      >
        {pending
          ? '用意しています…'
          : target === batch.issued
            ? `${batch.issued} 枚 用意できています`
            : `${target} 枚 にする`}
      </Button>

      {saved && !error && !pending && (
        <p className="text-[11.5px] leading-none text-matcha">
          {batch.issued} 枚 用意できました。「チケットQR」の画面から印刷できます。
          {batch.issued > 0 && ` （販売できる残り ${batchForSale(batch)} 枚）`}
        </p>
      )}
    </Card>
  );
}
