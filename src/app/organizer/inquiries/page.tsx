'use client';

import { useEffect, useState, useTransition } from 'react';

import { fetchInquiries, replyToInquiry } from '@/app/actions';
import { BroadcastComposer } from '@/components/BroadcastComposer';
import {
  Button,
  Card,
  Empty,
  Eyebrow,
  Note,
  Notice,
  ScreenHeader,
  SectionLabel,
  Title,
  inputClass,
} from '@/components/ui';
import { MAX_INQUIRY_BODY, countChars, type Inquiry } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 連絡。全員へのお知らせの配信（Issue #54）と、蔵・参加者からの問い合わせ。
 *
 * 配信のために 8 つ目のタブを足すと、幅 320px で 1 つ 40px になり、指で押せる
 * 大きさ（44px）を割る。どちらも「主催者と蔵・参加者のやり取り」なので、
 * 問い合わせのタブにまとめ、名前を「連絡」にした。問い合わせは未回答が先に並ぶ。
 */
export default function InquiriesPage() {
  const { snapshot } = useSnapshot();
  const [rows, setRows] = useState<Inquiry[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const result = await fetchInquiries();
      if (result.ok && result.value) setRows(result.value);
    });
  };

  // 開いたときと、未回答の件数が変わったときに読み直す。
  useEffect(load, [snapshot?.openInquiries]);

  const open = rows?.filter((r) => !r.answer).length ?? 0;

  return (
    <>
      <ScreenHeader>
        <Eyebrow>MESSAGES</Eyebrow>
        <Title>連絡</Title>
        <div className="mt-2">
          <Note>
            {open > 0
              ? `${open} 件 返事を待っています。`
              : '返事を待っている問い合わせはありません。'}
          </Note>
        </div>
      </ScreenHeader>

      <SectionLabel>全員へのお知らせ</SectionLabel>
      <div className="px-5">
        <BroadcastComposer />
      </div>

      <SectionLabel>問い合わせ</SectionLabel>
      <div className="flex flex-col gap-3 px-5 pb-4">
        {pending && !rows && <Empty>読み込んでいます…</Empty>}
        {rows?.length === 0 && (
          <Empty>
            まだ問い合わせはありません。
            <br />
            酒蔵や参加者がヘルプから送ると、ここに届きます。
          </Empty>
        )}
        {rows?.map((inquiry) => (
          <InquiryCard key={inquiry.id} inquiry={inquiry} onDone={load} />
        ))}
      </div>
    </>
  );
}

function InquiryCard({ inquiry, onDone }: { inquiry: Inquiry; onDone: () => void }) {
  const [answer, setAnswer] = useState(inquiry.answer ?? '');
  const [editing, setEditing] = useState(!inquiry.answer);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = countChars(answer);
  const tooLong = count > MAX_INQUIRY_BODY;

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await replyToInquiry(inquiry.id, answer);
      if (result.ok) {
        setEditing(false);
        onDone();
      } else {
        setError(result.reason);
      }
    });
  };

  return (
    <Card animate className={inquiry.answer ? undefined : 'border-gold/45 bg-gold/8'}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-bold leading-snug text-ink">
            {inquiry.subject || '（件名なし）'}
          </span>
          <span className="text-[11px] leading-none text-ink-55">
            {inquiry.fromRole === 'brewery' ? '酒蔵' : '参加者'} ・ {inquiry.fromLabel} ・{' '}
            {new Date(inquiry.createdAt).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1.5 text-[10.5px] font-bold leading-none ${
            inquiry.answer ? 'bg-matcha/16 text-matcha' : 'bg-gold/20 text-gold-bright'
          }`}
        >
          {inquiry.answer ? '返事済' : '未回答'}
        </span>
      </div>

      <p className="rounded-field bg-ink/7 p-3 text-[12.5px] leading-[1.9] whitespace-pre-wrap text-ink/85">
        {inquiry.body}
      </p>

      {error && <Notice tone="danger">{error}</Notice>}

      {editing ? (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
            <span>返事</span>
            <span className={tooLong ? 'text-terracotta-soft' : ''}>
              {count} / {MAX_INQUIRY_BODY}
            </span>
          </span>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="相手がすぐ動ける言葉で書いてください。"
            className={`${inputClass} resize-y leading-[1.8]`}
          />
          <div className="flex gap-2">
            {inquiry.answer && (
              <Button
                tone="flat"
                className="flex-1"
                onClick={() => {
                  setAnswer(inquiry.answer ?? '');
                  setEditing(false);
                }}
              >
                やめる
              </Button>
            )}
            <Button
              tone="go"
              className="flex-1"
              onClick={send}
              disabled={pending || !answer.trim() || tooLong}
            >
              {pending ? '送っています…' : inquiry.answer ? '返事を書き直す' : '返事を送る'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <div className="flex flex-col gap-1.5 rounded-field border border-matcha/35 bg-matcha/8 p-3">
            <span className="text-[11px] leading-none font-bold text-matcha">返事</span>
            <p className="text-[12.5px] leading-[1.9] whitespace-pre-wrap text-ink/85">
              {inquiry.answer}
            </p>
          </div>
          <Button tone="flat" block onClick={() => setEditing(true)}>
            書き直す
          </Button>
        </div>
      )}
    </Card>
  );
}
