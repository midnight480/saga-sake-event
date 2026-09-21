'use client';

import Link from 'next/link';
import {
  Card,
  Empty,
  Eyebrow,
  Note,
  SectionLabel,
  StatusBadge,
  Title,
} from '@/components/ui';
import { STATUS_MESSAGE } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** マイページ。チケット残高と、自分の注文の様子。 */
export default function GuestHome() {
  const { snapshot, isInitialLoading } = useSnapshot();

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const guest = snapshot.guest;
  if (!guest) return <Empty>参加者の情報が読み込めませんでした。画面を更新してください。</Empty>;

  // まだ一度もポイントが入っていない人。受付での読み取りに案内する。
  const notStarted = guest.tickets === 0 && guest.used === 0;
  if (notStarted) return <BeforeStart displayNo={guest.displayNo} />;

  const myRequests = snapshot.requests
    .filter((r) => r.guestClerkId === guest.clerkUserId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      <header className="border-b border-hairline bg-linear-to-b from-card to-surface px-5 pt-5 pb-6">
        <div className="mb-4">
          <span className="text-[12px] text-ink-55">{guest.displayNo}</span>
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

/**
 * まだポイントが入っていない人に見せる画面。
 *
 * 参加区分を自分で選ばせるのをやめた。当日は受付で券を受け取り、その QR を
 * 読み取って始める。券の種類で配るポイントが決まるので、本人が選ぶものは無い。
 */
function BeforeStart({ displayNo }: { displayNo: string }) {
  return (
    <div className="flex flex-col gap-6 px-5 py-8">
      <div>
        <Eyebrow>WELCOME</Eyebrow>
        <Title size="lg">受付で券を受け取ってください</Title>
        <div className="mt-3">
          <Note>
            会場の受付で券をお受け取りのうえ、その QR コードを読み取ってください。
            読み取ると、この画面にポイントが入ります。
          </Note>
        </div>
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-ink-55">あなたの番号</span>
          <span className="font-display text-[20px] text-ink">{displayNo}</span>
        </div>
      </Card>

      <Link
        href="/guest/charge"
        className="flex min-h-14 items-center justify-center rounded-field bg-terracotta text-[15px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-terracotta-hover"
      >
        券の QR を読み取る
      </Link>

      <p className="text-[11.5px] leading-[1.9] text-ink-45">
        券をお持ちでない場合は、会場の受付にお声がけください。
      </p>
    </div>
  );
}
