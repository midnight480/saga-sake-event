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

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
