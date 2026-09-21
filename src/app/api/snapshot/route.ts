import { NextResponse } from 'next/server';

import { getViewer } from '@/lib/auth';
import { hasDatabase } from '@/lib/db';
import { getSnapshot, type SnapshotScope } from '@/lib/store';

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

    // ログインしていない人には何も返さない（Issue #39）。以前は誰にでも
    // 全員の注文と蔵のログイン ID を返していた。この口を使う画面は、どれも
    // ログインした人しか開けないので、ここで断っても困る画面は無い。
    if (!viewer) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 役割ごとに中身を絞る。蔵のアカウントなのに蔵が見つからない場合は、
    // 蔵の分として何も見せない（空の蔵 ID で絞るので注文は 0 件になる）。
    const scope: SnapshotScope =
      viewer.role === 'organizer'
        ? { role: 'organizer', userId: viewer.userId }
        : viewer.role === 'brewery'
          ? { role: 'brewery', userId: viewer.userId, breweryId: viewer.breweryId ?? '' }
          : { role: 'guest', userId: viewer.userId };
    const snapshot = await getSnapshot(scope);

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
