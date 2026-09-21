import { headers } from 'next/headers';
import Link from 'next/link';
import QRCode from 'qrcode';

import { requireOrganizer } from '@/lib/auth';
import { listTicketBatches, listUnredeemedCodes } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * 受付に置くものを 1 枚にまとめた印刷用ページ。
 *
 * 上半分が、貼っておく共通 QR。当日ずっと使い回せる。
 * 下半分が、切り離して 1 人 1 枚ずつ渡すコード。こちらは一度きり。
 */
export default async function TicketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; count?: string }>;
}) {
  await requireOrganizer();

  const { batch: batchId, count } = await searchParams;
  const limit = Math.min(500, Math.max(1, Number(count) || 100));

  const batches = await listTicketBatches();
  const targets = batchId ? batches.filter((b) => b.id === batchId) : batches;

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const chargeUrl = `${protocol}://${host}/guest/charge`;

  const qr = await QRCode.toString(chargeUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'H',
  });

  const sections = await Promise.all(
    targets.map(async (batch) => ({
      batch,
      codes: await listUnredeemedCodes(batch.id, limit),
    })),
  );

  return (
    <div className="min-h-dvh bg-sumi px-5 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="no-print mb-6 flex flex-col gap-3">
          <h1 className="font-display text-[26px] tracking-[0.05em] text-ink">
            受付に置くもの ─ 印刷用
          </h1>
          <p className="text-[12.5px] leading-[1.8] text-ink-55">
            上の QR は 1 枚だけ貼れば、当日ずっと使い回せます。
            下のコードは切り離して、1 人に 1 枚ずつお渡しください。
          </p>
          <div className="flex flex-wrap gap-2">
            {[50, 100, 300, 500].map((n) => (
              <Link
                key={n}
                href={`/organizer/tickets/print?count=${n}${batchId ? `&batch=${batchId}` : ''}`}
                className="flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-[12px] text-ink-55 hover:text-ink"
              >
                コード {n} 件
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

        {/* ── 受付に貼る QR ── */}
        <section className="mb-8 flex flex-col items-center gap-4 rounded-card border border-hairline bg-ink p-8 text-center print:break-after-page print:rounded-none print:border-black/40 print:bg-white">
          <div className="text-[11px] tracking-[0.3em] text-black/55">佐賀 蔵めぐり</div>
          <h2 className="font-display text-[26px] text-black">
            お手元の券のコードを入れてください
          </h2>
          <div
            className="w-full max-w-[320px] [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-[13px] leading-[1.9] text-black/70">
            スマートフォンのカメラでこの QR を読み取り、
            <br />
            紙の券に書かれたコードを入力すると、ポイントが入ります。
          </p>
          <p className="font-mono text-[11px] break-all text-black/50">{chargeUrl}</p>
        </section>

        {/* ── 切り離して渡すコード ── */}
        {sections.map(({ batch, codes }) => (
          <section key={batch.id} className="mb-8">
            <h2 className="mb-3 font-display text-[20px] text-ink print:text-black">
              {batch.label} ─ {batch.cupsPerTicket} ポイント（{codes.length} 件）
            </h2>

            {codes.length === 0 ? (
              <p className="text-[12.5px] text-ink-55 print:text-black/60">
                まだ発行されていません。「チケットQR」の画面で発行してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                {codes.map((code) => (
                  <article
                    key={code}
                    className="flex flex-col items-center gap-1.5 rounded-card border border-hairline bg-ink p-3 text-center print:break-inside-avoid print:rounded-none print:border-black/40 print:bg-white"
                  >
                    <div className="text-[9px] tracking-[0.24em] text-black/55">
                      {batch.label}
                    </div>
                    <div className="font-mono text-[15px] font-bold tracking-wider text-black">
                      {code}
                    </div>
                    <div className="text-[9px] leading-snug text-black/55">
                      {batch.cupsPerTicket} ポイント / この券は一度だけ使えます
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
