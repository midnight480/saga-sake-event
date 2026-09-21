'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { chooseGuestKind } from '@/app/actions';
import {
  Button,
  Card,
  Chip,
  Empty,
  Eyebrow,
  Note,
  Notice,
  SectionLabel,
  StatusBadge,
  Title,
  inputClass,
} from '@/components/ui';
import { INITIAL_TICKETS, STATUS_MESSAGE, type GuestKind } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** マイページ。チケット残高と、自分の注文の様子。 */
export default function GuestHome() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const guest = snapshot.guest;
  if (!guest) return <Empty>参加者の情報が読み込めませんでした。画面を更新してください。</Empty>;

  // まだ 1 枚も持っていない＝参加区分を選んでいない人。最初にここを通す。
  const needsKind = guest.tickets === 0 && guest.used === 0;
  if (needsKind) return <ChooseKind />;

  const myRequests = snapshot.requests
    .filter((r) => r.guestClerkId === guest.clerkUserId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      <header className="border-b border-hairline bg-linear-to-b from-card to-surface px-5 pt-5 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[12px] text-ink-55">{guest.displayNo}</span>
          <span
            className={`rounded-full px-2.5 py-1.5 text-[10.5px] font-bold leading-none ${
              guest.kind === '酒蔵特別枠' ? 'bg-gold/18 text-gold-bright' : 'bg-ink/9 text-ink-55'
            }`}
          >
            {guest.kind}
          </span>
        </div>

        <Eyebrow>TICKETS</Eyebrow>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[56px] leading-none text-ink">{guest.tickets}</span>
          <span className="text-[15px] text-ink-55">ポイント</span>
          <span className="ml-auto flex-none text-[11.5px] leading-none whitespace-nowrap text-ink-45">
            使用済 {guest.used} ポイント
          </span>
        </div>

        <Link
          href="/guest/charge"
          className="mt-5 flex min-h-12 items-center justify-center rounded-field border border-gold/50 text-[13px] font-bold tracking-[0.08em] text-gold transition-colors hover:bg-gold/12"
        >
          会場でポイントを追加する
        </Link>
      </header>

      <SectionLabel>わたしのリクエスト</SectionLabel>
      <div className="flex flex-col gap-3 px-5 pb-6">
        {myRequests.length === 0 ? (
          <Empty>
            まだ注文はありません。
            <br />
            ブースの前で銘柄を選んでください。
          </Empty>
        ) : (
          myRequests.map((request) => {
            const brewery = snapshot.breweries.find((b) => b.id === request.breweryId);
            return (
              <Card key={request.id} animate>
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-display text-[18px] tracking-[0.04em] text-ink">
                      {request.brand}
                    </span>
                    <span className="text-[11.5px] leading-none text-ink-55">
                      {brewery?.name ?? '―'} ・ {request.cups} 杯 ・ {request.ticketCost} ポイント
                      {brewery?.booth ? ` ・ ${brewery.booth}` : ''}
                    </span>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <p className="border-t border-hairline pt-2.5 text-[12px] leading-[1.7] text-ink-70">
                  {STATUS_MESSAGE[request.status]}
                </p>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

/** 参加区分をえらぶ。ここで初回のチケットが配られる。 */
function ChooseKind() {
  const { refresh } = useSnapshot();
  const [kind, setKind] = useState<GuestKind>('一般参加');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await chooseGuestKind(kind, inviteCode);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6 px-5 py-8">
      <div>
        <Eyebrow>WELCOME</Eyebrow>
        <Title size="lg">参加区分をえらぶ</Title>
        <div className="mt-3">
          <Note>
            えらぶと、その区分のポイントが配られます。あとから変えられないので、
            お手元の案内をご確認ください。
          </Note>
        </div>
      </div>

      <div className="flex gap-2">
        {(['一般参加', '酒蔵特別枠'] as GuestKind[]).map((k) => (
          <Chip key={k} active={kind === k} className="flex-1" onClick={() => setKind(k)}>
            {k}
          </Chip>
        ))}
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-ink-55">配られるポイント</span>
          <span>
            <span className="font-display text-[30px] text-gold">{INITIAL_TICKETS[kind]}</span>
            <span className="ml-1 text-[12px] text-ink-55">ポイント</span>
          </span>
        </div>
      </Card>

      {kind === '酒蔵特別枠' && (
        <label className="flex flex-col gap-2">
          <span className="text-[11.5px] leading-none tracking-[0.08em] text-ink-55">
            招待コード
          </span>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="主催者から伝えられたコード"
            className={inputClass}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <span className="text-[11px] leading-[1.6] text-ink-45">
            酒蔵特別枠は、関係者向けの枠です。コードは主催者にお尋ねください。
          </span>
        </label>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <Button tone="go" block onClick={submit} disabled={pending}>
        {pending ? '登録しています…' : 'この区分ではじめる'}
      </Button>
    </div>
  );
}
