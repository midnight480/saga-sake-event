'use client';

import { useEffect, useState, useTransition } from 'react';

import { discardAllTickets, resetEvent, saveEvent, setCupsPerTicket, setPhase } from '@/app/actions';
import {
  Button,
  Card,
  ConfirmDialog,
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
import { orderingStatus, type EventPhase, type TicketBatch } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** STEP 1 ── イベントの日付・時刻・規模を決める。 */
export default function EventSettingsPage() {
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 受付解禁は会場全体に影響するので、押し間違いを確認で受け止める。
  // 予定を上書きする操作は、押し間違いを確認で受け止める。
  const [confirming, setConfirming] = useState<'open' | 'closed' | null>(null);

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
  const status = orderingStatus(event, new Date(snapshot.serverTime));

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

  const applyPhase = (phase: EventPhase) => {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const result = await setPhase(phase);
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

      <SectionLabel>券種ごとのポイント</SectionLabel>
      <div className="flex flex-col gap-3 px-5">
        <Note>
          前売券・当日券を 1 枚 読み取った参加者に、何ポイント渡すかを決めます。
          券を何枚 刷るかは「チケットQR」の画面で決めます。
        </Note>
        {snapshot.batches.map((batch) => (
          <TicketPlan key={batch.id} batch={batch} />
        ))}
      </div>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-3 border-t border-hairline pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] leading-none tracking-[0.08em] text-ink-55">
              いまの受付
            </span>
            <span
              className={`text-[13px] font-bold leading-none ${
                status.open ? 'text-matcha' : status.manual ? 'text-terracotta-soft' : 'text-gold'
              }`}
            >
              {status.label}
            </span>
          </div>

          <Note>
            {draft.startTime} から {draft.endTime} までは自動で受け付けます。
            {status.manual && '　いまは予定を上書きしています。'}
          </Note>

          {status.manual ? (
            <Button tone="go" block onClick={() => applyPhase('auto')} disabled={pending}>
              予定どおりにもどす
            </Button>
          ) : status.open ? (
            <Button tone="flat" block onClick={() => setConfirming('closed')} disabled={pending}>
              いますぐ受付を止める
            </Button>
          ) : (
            <Button tone="go" block onClick={() => setConfirming('open')} disabled={pending}>
              いますぐ受付を開く
            </Button>
          )}

          <ConfirmDialog
            open={confirming === 'open'}
            title="いますぐ受付を開きますか"
            confirmLabel="はい、開きます"
            onConfirm={() => applyPhase('open')}
            onCancel={() => setConfirming(null)}
            pending={pending}
          >
            本来は {draft.startTime} から自動で受け付けます。それを待たずに、
            いまから参加者がリクエストを送れる状態にします。
            <br />
            登録済みの酒蔵は {registered} 蔵です。
            {registered === 0 && (
              <>
                <br />
                <span className="text-terracotta-soft">
                  まだ酒蔵が 1 つも登録されていません。このまま開くと、参加者は注文する相手がいない状態になります。
                </span>
              </>
            )}
          </ConfirmDialog>

          <ConfirmDialog
            open={confirming === 'closed'}
            title="いますぐ受付を止めますか"
            confirmLabel="はい、止めます"
            onConfirm={() => applyPhase('closed')}
            onCancel={() => setConfirming(null)}
            pending={pending}
          >
            本来は {draft.endTime} まで受け付けます。それを待たずに、いまから参加者が
            リクエストを送れない状態にします。
            <br />
            すでに受けている注文は残ります。蔵の画面から最後まで進めてください。
          </ConfirmDialog>
        </div>
      </div>

      <SectionLabel>新しいイベントを始める</SectionLabel>
      <div className="px-5 pb-7">
        <ResetEvent />
      </div>
    </>
  );
}

/**
 * 次のイベントのための片付け。
 *
 * 前回の残りが混ざっていると、前回のポイントで飲めてしまったり、
 * 在庫が前回のままだったりする。年に一度しか押さないが、押せないと
 * 毎回データベースを作り直すことになる。
 */
function ResetEvent() {
  const { snapshot, refresh } = useSnapshot();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const breweries = snapshot?.breweries.length ?? 0;
  const items = snapshot?.breweries.reduce((sum, b) => sum + b.items.length, 0) ?? 0;
  const requests = snapshot?.requests.length ?? 0;
  const tickets = snapshot?.batches.reduce((sum, b) => sum + b.issued, 0) ?? 0;

  const run = () => {
    setConfirming(false);
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await resetEvent();
      if (result.ok && result.value) {
        const c = result.value;
        setDone(
          `片付けました。注文 ${c.requests} 件、銘柄 ${c.items} 件、券 ${c.tickets} 枚、` +
            `参加者 ${c.guests} 名、問い合わせ ${c.inquiries} 件を消しました。`,
        );
      } else if (!result.ok) {
        setError(result.reason);
      }
      await refresh();
    });
  };

  return (
    <Card className="border-terracotta/40">
      <Note>
        前回のイベントの記録を片付けて、次のイベントを始められるようにします。
        酒蔵のアカウントは残るので、蔵ID とパスワードを配り直す必要はありません。
      </Note>

      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="info">{done}</Notice>}

      <Button tone="flat" block onClick={() => setConfirming(true)} disabled={pending}>
        {pending ? '片付けています…' : '前回の記録を片付ける'}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="前回の記録を片付けますか"
        confirmLabel="はい、片付けます"
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        pending={pending}
      >
        <strong className="text-terracotta-soft">消えるもの</strong>
        <br />
        注文 {requests} 件 / 銘柄 {items} 件 / 券 {tickets} 枚 / 参加者の残高 / 問い合わせ
        <br />
        <br />
        <strong className="text-matcha">残るもの</strong>
        <br />
        酒蔵 {breweries} 蔵のアカウント（蔵ID・パスワードはそのまま）/ 主催者 /
        券種ごとのポイント設定
        <br />
        <br />
        参加者はもう一度ログインすると、ポイント 0 から始まります。
        蔵には、開場前に銘柄と本数を登録し直してもらってください。
        <br />
        <br />
        この操作は元に戻せません。
      </ConfirmDialog>
    </Card>
  );
}

/**
 * 券種ごとに「参加者へ何ポイント渡すか」を決める。
 *
 * 前売と当日で額を変えたいことがある（前売は少し多めにする、など）ので
 * 券種ごとに持つ。券を何枚 刷るかは別の話なので「チケットQR」に置いている。
 */
function TicketPlan({ batch }: { batch: TicketBatch }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 発行して配ってしまうと券の値打ちが変わるので、1 枚も無いときだけ変えられる。
  const canChange = batch.issued === 0;

  const change = (next: number) => {
    setError(null);
    startTransition(async () => {
      const result = await setCupsPerTicket(batch.id, next);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[18px] text-ink">{batch.label}</span>
        <span className="text-[11.5px] leading-none text-ink-55">
          刷った券 {batch.issued} 枚
        </span>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="rounded-field border border-hairline-strong bg-card px-3.5 py-2.5">
        <Stepper
          label="割り当てるポイント"
          unit="ポイント"
          value={batch.cupsPerTicket}
          onDecrease={() => change(Math.max(1, batch.cupsPerTicket - 1))}
          onIncrease={() => change(batch.cupsPerTicket + 1)}
          decreaseDisabled={!canChange || pending || batch.cupsPerTicket <= 1}
          increaseDisabled={!canChange || pending}
        />
      </div>

      {done && <Notice tone="info">{done}</Notice>}

      {!canChange && (
        <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
          <p className="text-[11.5px] leading-[1.8] text-ink-55">
            すでに {batch.issued} 枚 刷っているため、ポイントを変えられません。
            新しいイベントを始める場合は、前回の券をここで取り消してください。
          </p>
          <Button tone="flat" block onClick={() => setConfirming(true)} disabled={pending}>
            刷った券をすべて取り消す
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`${batch.label}をすべて取り消しますか`}
        confirmLabel="はい、取り消します"
        onConfirm={() => {
          setConfirming(false);
          setError(null);
          setDone(null);
          startTransition(async () => {
            const result = await discardAllTickets(batch.id);
            if (result.ok && result.value) {
              const { removed, redeemed } = result.value;
              setDone(
                redeemed > 0
                  ? `${removed} 枚 取り消しました（うち読み取り済み ${redeemed} 枚）。`
                  : `${removed} 枚 取り消しました。`,
              );
            } else if (!result.ok) {
              setError(result.reason);
            }
            await refresh();
          });
        }}
        onCancel={() => setConfirming(false)}
        pending={pending}
      >
        刷った {batch.issued} 枚をすべて消します。
        {batch.redeemed > 0 && (
          <>
            <br />
            <span className="text-terracotta-soft">
              うち {batch.redeemed} 枚は、すでに参加者が読み取っています。
            </span>
          </>
        )}
        <br />
        <br />
        配った紙の券は、すべて使えなくなります。まだ配っていないか、前回の
        イベントのものかを確かめてください。
        <br />
        <br />
        すでに渡したポイントは戻りません（もう召し上がったぶんまで取り上げないためです）。
      </ConfirmDialog>
    </Card>
  );
}
