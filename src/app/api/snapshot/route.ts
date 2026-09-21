import { NextResponse } from 'next/server';

import { getViewer } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';
import { getSnapshot } from '@/lib/store';

/**
 * 会場のいまを 1 回で返す口。
 *
 * 3 つの役割の画面がこれを数秒おきに取りに来て、同じ数字を共有する。
 * WebSocket を使わないのは、追加の契約や設定なしでどこでも動くことを
 * 優先しているから（非エンジニアのデプロイ工程を増やさないため）。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ error: 'setup-required' }, { status: 503 });
  }

  try {
    const viewer = await getViewer();
    // 参加者の残高を混ぜて返すのは、本人がログインしているときだけ。
    const snapshot = await getSnapshot(viewer?.role === 'guest' ? viewer.userId : undefined);

    // 節目を過ぎていればお知らせを送る。cron を使わずに済ませるため、
    // 画面が現在値を取りに来るこの機会に確かめている。送った記録は
    // 開催日と節目の組で 1 行しか作れないので、二重には送られない。
    // 応答は待たせない（お知らせのために画面が遅くなるのは本末転倒）。
    void import('@/lib/push').then(({ sendDueNotices }) =>
      sendDueNotices(snapshot.event, new Date(snapshot.serverTime)).catch(() => {}),
    );

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
