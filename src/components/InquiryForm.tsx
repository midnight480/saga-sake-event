'use client';

import { useEffect, useState, useTransition } from 'react';

import { fetchMyInquiries, sendInquiry } from '@/app/actions';
import { Button, Card, Notice, inputClass } from '@/components/ui';
import { HelpSection, HelpText } from '@/components/Help';
import { MAX_INQUIRY_BODY, MAX_INQUIRY_SUBJECT, countChars, type Inquiry } from '@/lib/domain';

/**
 * 主催者への問い合わせ。蔵と参加者のヘルプに置く。
 *
 * やり取りが続く前提にしていない。会場で長い会話はできないので、
 * 1 つの問いに 1 つの答えが返って終わり、という形にしている。
 */
export function InquiryForm() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<Inquiry[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const result = await fetchMyInquiries();
      if (result.ok && result.value) setMine(result.value);
    });
  };

  useEffect(load, []);

  const bodyCount = countChars(body);
  const subjectCount = countChars(subject);
  const tooLong = bodyCount > MAX_INQUIRY_BODY || subjectCount > MAX_INQUIRY_SUBJECT;

  const submit = () => {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendInquiry({ subject, body });
      if (result.ok) {
        setSubject('');
        setBody('');
        setSent(true);
        const fresh = await fetchMyInquiries();
        if (fresh.ok && fresh.value) setMine(fresh.value);
      } else {
        setError(result.reason);
      }
    });
  };

  return (
    <>
      <HelpSection title="主催者に聞く">
        <HelpText>
          ここに書いた内容は、主催者の画面に届きます。返事が来ると、下の
          「送った内容」に出ます。
        </HelpText>

        <Card>
          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
              <span>件名（任意）</span>
              <span className={subjectCount > MAX_INQUIRY_SUBJECT ? 'text-terracotta-soft' : ''}>
                {subjectCount} / {MAX_INQUIRY_SUBJECT}
              </span>
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="（入れなくても送れます）"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
              <span>お問い合わせの内容</span>
              <span className={bodyCount > MAX_INQUIRY_BODY ? 'text-terracotta-soft' : ''}>
                {bodyCount} / {MAX_INQUIRY_BODY}
              </span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="困っていることを書いてください。"
              className={`${inputClass} resize-y leading-[1.8]`}
            />
          </label>

          {error && <Notice tone="danger">{error}</Notice>}
          {sent && !error && <Notice tone="info">送りました。返事をお待ちください。</Notice>}

          <Button
            tone="go"
            block
            onClick={submit}
            disabled={pending || !body.trim() || tooLong}
          >
            {pending ? '送っています…' : '主催者に送る'}
          </Button>
        </Card>
      </HelpSection>

      {mine && mine.length > 0 && (
        <HelpSection title="送った内容と返事">
          <div className="flex flex-col gap-3">
            {mine.map((inquiry) => (
              <Card key={inquiry.id}>
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    {inquiry.subject && (
                      <span className="text-[13px] font-bold leading-snug text-ink">
                        {inquiry.subject}
                      </span>
                    )}
                    <span className="text-[11px] leading-none text-ink-45">
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
                      inquiry.answer ? 'bg-matcha/16 text-matcha' : 'bg-gold/18 text-gold-bright'
                    }`}
                  >
                    {inquiry.answer ? '返事あり' : '返事待ち'}
                  </span>
                </div>

                <p className="text-[12.5px] leading-[1.9] whitespace-pre-wrap text-ink-70">
                  {inquiry.body}
                </p>

                {inquiry.answer && (
                  <div className="flex flex-col gap-1.5 rounded-field border border-matcha/35 bg-matcha/8 p-3">
                    <span className="text-[11px] leading-none font-bold text-matcha">
                      主催者からの返事
                    </span>
                    <p className="text-[12.5px] leading-[1.9] whitespace-pre-wrap text-ink/85">
                      {inquiry.answer}
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </HelpSection>
      )}
    </>
  );
}
