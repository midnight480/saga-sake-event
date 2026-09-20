import { headers } from 'next/headers';
import Link from 'next/link';
import QRCode from 'qrcode';

import { requireOrganizer } from '@/lib/auth';
import { listTicketBatches, listUnredeemedCodes } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * チケットQRの台紙。
 *
 * QRには「会場のURL + 券コード」を入れる。アプリの読み取り画面でも、
 * 端末標準のカメラアプリでも同じように開けるので、参加者が迷わない。
 */
export default async function TicketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; count?: string }>;
}) {
  await requireOrganizer();

  const { batch: batchId = 'same-day', count } = await searchParams;
  const limit = Math.min(200, Math.max(1, Number(count) || 50));

  const batches = await listTicketBatches();
  const batch = batches.find((b) => b.id === batchId);
  if (!batch) {
    return (
      <Fallback>
        券種が見つかりませんでした。
        <Link href="/organizer/tickets">チケットQRの画面に戻る</Link>
      </Fallback>
    );
  }

  const codes = await listUnredeemedCodes(batchId, limit);
  if (codes.length === 0) {
    return (
      <Fallback>
        印刷できる券がありません。先に「{batch.label}」を発行してください。
        <Link href="/organizer/tickets">チケットQRの画面に戻る</Link>
      </Fallback>
    );
  }

  // 本番のURLを組み立てる。プレビュー環境でもそのホストが入る。
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const origin = `${protocol}://${host}`;

  const tickets = await Promise.all(
    codes.map(async (code) => ({
      code,
      svg: await QRCode.toString(`${origin}/guest/charge?code=${encodeURIComponent(code)}`, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
      }),
    })),
  );

  return (
    <div className="min-h-dvh bg-sumi px-5 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="no-print mb-6 flex flex-col gap-3">
          <h1 className="font-display text-[26px] tracking-[0.05em] text-ink">
            {batch.label} ─ 印刷用（{tickets.length} 枚）
          </h1>
          <p className="text-[12.5px] leading-[1.8] text-ink-55">
            切り取って受付に置いてください。1 枚ごとに違うコードなので、コピーしても増えません。
            まだ読み取られていない券を古い順に {tickets.length} 枚 並べています。
          </p>
          <div className="flex flex-wrap gap-2">
            {[20, 50, 100, 200].map((n) => (
              <Link
                key={n}
                href={`/organizer/tickets/print?batch=${batch.id}&count=${n}`}
                className="flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-[12px] text-ink-55 hover:text-ink"
              >
                {n} 枚
              </Link>
            ))}
            <Link
              href="/organizer/tickets"
              className="flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-[12px] text-ink-55 hover:text-ink"
            >
              戻る
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {tickets.map((ticket) => (
            <article
              key={ticket.code}
              className="flex flex-col items-center gap-2 rounded-card border border-hairline bg-ink p-4 text-center print:break-inside-avoid print:rounded-none print:border-black/40 print:bg-white"
            >
              <div className="text-[9px] tracking-[0.24em] text-black/55">佐賀 蔵めぐり</div>
              <div className="font-display text-[15px] text-black">{batch.label}</div>
              <div
                className="w-full max-w-[150px] [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: ticket.svg }}
              />
              <div className="font-mono text-[10px] break-all text-black/70">{ticket.code}</div>
              <div className="text-[9px] leading-snug text-black/55">
                スマートフォンで読み取ると
                <br />
                チケット {batch.cupsPerTicket} 枚が入ります
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sumi px-6">
      <div className="flex max-w-[420px] flex-col gap-4 text-center text-[13px] leading-[1.9] text-ink-55">
        {children}
      </div>
    </div>
  );
}
