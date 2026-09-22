import { NextResponse } from 'next/server';

import { hasDatabase } from '@/lib/db';

/**
 * 通知を閉じた・押したときに、🔔 の同じお知らせを既読にする口（Issue #80）。
 *
 * 呼ぶのは常駐スクリプト（public/sw.js）。アプリを閉じたまま通知だけ閉じることも
 * あるので、ログインの状態には頼らず、通知に添えた署名で本人あてだったことを確かめる
 * （push.ts の readSignature）。署名が合わなければ何もしない。
 *
 * 失敗しても 204 を返す。既読にできなくても 🔔 に未読で残るだけで、困ることはない。
 * 常駐スクリプトの側で失敗を扱う必要をなくしておく。
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasDatabase()) return new NextResponse(null, { status: 204 });

  try {
    // 形の合わない本文は、黙って捨てる（ログに残すほどのことではない）。
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      id?: unknown;
      user?: unknown;
      sig?: unknown;
    };
    const id = Number(body.id);
    const { user, sig } = body;
    if (!Number.isSafeInteger(id) || typeof user !== 'string' || typeof sig !== 'string') {
      return new NextResponse(null, { status: 204 });
    }

    const { verifyReadSignature } = await import('@/lib/push');
    if (await verifyReadSignature(id, user, sig)) {
      const { markNoticeReadBySignedPush } = await import('@/lib/store');
      await markNoticeReadBySignedPush(user, id);
    }
  } catch (error) {
    console.error('[notices/read] 既読にできませんでした', error);
  }
  return new NextResponse(null, { status: 204 });
}
