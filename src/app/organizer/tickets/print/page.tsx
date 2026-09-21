import { headers } from 'next/headers';
import Link from 'next/link';
import QRCode from 'qrcode';

import { requireOrganizer } from '@/lib/auth';
import { listTicketBatches, listUnredeemedCodes } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * 券の印刷用ページ。切り離して 1 人 1 枚ずつ渡す。
 *
 * ★ 券 1 枚ごとに、そのコード入りの QR を付ける（Issue #33）★
 * 以前は受付に共通の QR を 1 枚だけ貼り、券にはコードの文字だけを刷っていた。
 * ところが共通 QR にはコードが入っていないので、参加者がアプリのカメラで
 * 読んでも何も起きず、「QR が読み取れない」ことになっていた。
 *
 * 券の QR には /guest/charge?code=… を入れる。端末のカメラで読めばその画面が
 * 開いてそのまま加算され、アプリ内のカメラで読んでも同じコードが取り出せる。
 * QR の下にはコードの文字も残す。カメラが使えない端末でも打ち込めるように。
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

  // 誤り訂正は M。券は小さく刷るので、H にすると絵が細かくなりすぎて
  // かえって読みにくい。手で持って読む距離なら M で足りる。
  const qrOf = (code: string) =>
    QRCode.toString(`${chargeUrl}?code=${encodeURIComponent(code)}`, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
    });

  const sections = await Promise.all(
    targets.map(async (batch) => {
      const codes = await listUnredeemedCodes(batch.id, limit);
      return {
        batch,
        tickets: await Promise.all(codes.map(async (code) => ({ code, qr: await qrOf(code) }))),
      };
    }),
  );

  return (
    <div className="min-h-dvh bg-sumi px-5 py-10 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="no-print mb-6 flex flex-col gap-3">
          <h1 className="font-display text-[26px] tracking-[0.05em] text-ink">
            券 ─ 印刷用
          </h1>
          <p className="text-[12.5px] leading-[1.8] text-ink-55">
            切り離して、1 人に 1 枚ずつお渡しください。券ごとに QR が付いていて、
            参加者がスマートフォンのカメラで読み取るとポイントが入ります。
            QR は 1 枚ごとに違うので、同じ券を二度使うことはできません。
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

        {/* ── 切り離して渡す券 ── */}
        {sections.map(({ batch, tickets }) => (
          <section key={batch.id} className="mb-8">
            <h2 className="mb-3 font-display text-[20px] text-ink print:text-black">
              {batch.label} ─ {batch.cupsPerTicket} ポイント（{tickets.length} 件）
            </h2>

            {tickets.length === 0 ? (
              <p className="text-[12.5px] text-ink-55 print:text-black/60">
                まだ発行されていません。「チケットQR」の画面で発行してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                {tickets.map(({ code, qr }) => (
                  <article
                    key={code}
                    className="flex flex-col items-center gap-1.5 rounded-card border border-hairline bg-ink p-3 text-center print:break-inside-avoid print:rounded-none print:border-black/40 print:bg-white"
                  >
                    <div className="text-[9px] tracking-[0.24em] text-black/55">
                      佐賀 蔵めぐり ・ {batch.label}
                    </div>
                    {/* 印刷で 25mm 前後になる大きさ。スマホのカメラで手元から読める。 */}
                    <div
                      className="w-full max-w-[120px] [&>svg]:h-auto [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: qr }}
                    />
                    <div className="font-mono text-[13px] font-bold tracking-wider break-all text-black">
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
