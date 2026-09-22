'use client';

import { useEffect, useState, useTransition } from 'react';

import { fetchMessageRecipients, fetchSentMessages, sendBroadcast } from '@/app/actions';
import { Button, Card, Chip, ConfirmDialog, Notice, inputClass } from '@/components/ui';
import {
  MAX_MESSAGE_BODY,
  MAX_MESSAGE_TITLE,
  MESSAGE_AUDIENCES,
  countChars,
  formatJstDateTime,
  type MessageAudience,
  type MessageRecipients,
  type SentMessage,
} from '@/lib/domain';

const AUDIENCE_LABEL: Record<MessageAudience, string> = Object.fromEntries(
  MESSAGE_AUDIENCES.map((a) => [a.value, a.label]),
) as Record<MessageAudience, string>;

/**
 * 全酒蔵・全参加者へのお知らせの配信（Issue #54）。
 *
 * 個別の蔵・参加者あては作らない。会場で主催者が走り回りながら使うので、
 * 宛先は 3 つから選ぶだけにした。送ったものは宛先の人の 🔔 に残り、
 * 通知を受け取る設定の端末にはスマホの通知も届く。
 *
 * 送ったあとは取り消せないので、必ず確認を挟む。確認には「何蔵・何人に
 * 届くか」を数で出す（「本当によろしいですか」だけでは判断できない）。
 */
export function BroadcastComposer() {
  const [audience, setAudience] = useState<MessageAudience>('brewery+guest');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [recipients, setRecipients] = useState<Record<MessageAudience, MessageRecipients> | null>(null);
  const [sent, setSent] = useState<SentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadSent = () => {
    startTransition(async () => {
      const result = await fetchSentMessages();
      if (result.ok) setSent(result.value ?? []);
    });
  };
  useEffect(loadSent, []);

  const titleCount = countChars(title.trim());
  const bodyCount = countChars(body.trim());
  const invalid =
    !title.trim() || !body.trim() || titleCount > MAX_MESSAGE_TITLE || bodyCount > MAX_MESSAGE_BODY;

  // 確認を開くときに、いまの人数を取り直す。
  const openConfirm = () => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await fetchMessageRecipients();
      if (result.ok && result.value) setRecipients(result.value);
      setConfirming(true);
    });
  };

  const send = () => {
    startTransition(async () => {
      const result = await sendBroadcast({ audience, title, body });
      setConfirming(false);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setDone(`${AUDIENCE_LABEL[audience]}に送りました。`);
      setTitle('');
      setBody('');
      loadSent();
    });
  };

  const count = recipients?.[audience];

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-1">
          <span className="font-display text-[18px] text-ink">お知らせを配信する</span>
          <span className="text-[11.5px] leading-[1.7] text-ink-55">
            宛先の人の 🔔 に残ります。通知を受け取る設定の端末には、スマホの通知も届きます。
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11.5px] leading-none text-ink-55">宛先</span>
          <div role="radiogroup" aria-label="宛先" className="flex flex-wrap gap-2">
            {MESSAGE_AUDIENCES.map((a) => (
              <Chip key={a.value} active={audience === a.value} onClick={() => setAudience(a.value)}>
                {a.label}
              </Chip>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
            <span>件名</span>
            <span className={titleCount > MAX_MESSAGE_TITLE ? 'text-terracotta-soft' : ''}>
              {titleCount} / {MAX_MESSAGE_TITLE}
            </span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：15 時から乾杯のご案内"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
            <span>本文</span>
            <span className={bodyCount > MAX_MESSAGE_BODY ? 'text-terracotta-soft' : ''}>
              {bodyCount} / {MAX_MESSAGE_BODY}
            </span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="例：中央ステージで乾杯を行います。お手元のお酒をお持ちください。"
            className={`${inputClass} resize-y leading-[1.8]`}
          />
        </label>

        {error && <Notice tone="danger">{error}</Notice>}
        {done && <Notice tone="info">{done}</Notice>}

        <Button tone="go" block onClick={openConfirm} disabled={pending || invalid}>
          {`${AUDIENCE_LABEL[audience]}に送る…`}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirming}
        title={`${AUDIENCE_LABEL[audience]}に送りますか`}
        confirmLabel="はい、送ります"
        onConfirm={send}
        onCancel={() => setConfirming(false)}
        pending={pending}
      >
        {count && (
          <>
            <strong className="text-ink">届く相手</strong>
            <br />
            {audience === 'brewery'
              ? `酒蔵 ${count.breweries} 蔵`
              : audience === 'guest'
                ? `参加者 ${count.guests} 名`
                : `酒蔵 ${count.breweries} 蔵 / 参加者 ${count.guests} 名`}
            <br />
            （うち、スマホの通知を受け取る端末 {count.devices} 台）
            <br />
            <br />
          </>
        )}
        <strong className="text-ink">{title.trim()}</strong>
        <br />
        <span className="whitespace-pre-line">{body.trim()}</span>
        <br />
        <br />
        送ったあとは取り消せません。
      </ConfirmDialog>

      <div className="flex flex-col gap-2">
        <span className="px-1 text-[11px] leading-none tracking-[0.2em] text-ink-45">送ったお知らせ</span>
        {sent === null && <p className="px-1 text-[12px] text-ink-45">読み込んでいます…</p>}
        {sent?.length === 0 && (
          <p className="px-1 text-[12px] leading-[1.7] text-ink-45">まだ送ったお知らせはありません。</p>
        )}
        {sent?.map((m) => (
          <div key={m.id} className="flex flex-col gap-1.5 rounded-field border border-hairline bg-card px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13.5px] font-bold text-ink">{m.title}</span>
              <span className="flex-none font-mono text-[11px] text-ink-45">
                {formatJstDateTime(m.createdAt)}
              </span>
            </div>
            <span className="w-fit rounded-full border border-gold/40 px-2 py-0.5 text-[10.5px] text-gold">
              {AUDIENCE_LABEL[m.audience]}
            </span>
            <p className="text-[12px] leading-[1.7] whitespace-pre-line text-ink-70">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
