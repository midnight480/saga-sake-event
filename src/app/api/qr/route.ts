import { headers } from 'next/headers';
import QRCode from 'qrcode';

import { requireOrganizer } from '@/lib/auth';

/**
 * 受付に貼る共通 QR。
 *
 * 中身は「ポイントを追加する画面の URL」だけで、券のコードは入れない。
 * 1 枚 刷って貼っておけば、当日ずっと使い回せる。コードは紙の券に印刷して
 * 1 人 1 枚ずつ渡し、参加者がこの画面で打ち込む。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  await requireOrganizer();

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';

  const svg = await QRCode.toString(`${protocol}://${host}/guest/charge`, {
    type: 'svg',
    margin: 0,
    // 受付で少し離れた位置から読むので、誤り訂正を高めにする。
    errorCorrectionLevel: 'H',
  });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=3600',
    },
  });
}
