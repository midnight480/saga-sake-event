/**
 * お知らせ（Web Push）の送信。
 *
 * ★ 設定を増やさないための工夫 ★
 * Web Push には VAPID という鍵の組が要る。ふつうは環境変数で持たせるが、
 * それだと主催者の手順に「鍵を作って貼る」が増える。このアプリの方針に
 * 反するので、最初に必要になった時点で自動で作り、DB に置いて使い回す。
 *
 * 配信のきっかけも cron を使わない。画面が数秒ごとに現在値を取りに来るので、
 * そのついでに「節目を過ぎたか」を見て、過ぎていればその場で送る。
 * 送った記録は開催日と節目の組で 1 行だけ作れるようにしてあるので、
 * 何台が同時に取りに来ても二重には送られない。
 */

import webpush from 'web-push';

import { getSql } from './db';
import { ensureSchema } from './schema';
import { MILESTONES, dueMilestones, type EventSettings, type Milestone } from './domain';

async function db() {
  await ensureSchema();
  return getSql();
}

/** 送信元として名乗る連絡先。実在しなくても動くが、形式は要る。 */
const CONTACT = 'mailto:noreply@saga-sake-event.invalid';

let cached: { publicKey: string; privateKey: string } | null = null;

/**
 * VAPID の鍵。無ければ作って保存する。
 * 同時に呼ばれても、先に入った 1 組だけが残るようにしている。
 */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (cached) return cached;

  const sql = await db();
  const read = async () => {
    const rows = (await sql`
      SELECT key, value FROM app_meta WHERE key IN ('vapid_public', 'vapid_private')
    `) as { key: string; value: string }[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return map.vapid_public && map.vapid_private
      ? { publicKey: map.vapid_public, privateKey: map.vapid_private }
      : null;
  };

  const existing = await read();
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = webpush.generateVAPIDKeys();
  await sql`
    INSERT INTO app_meta (key, value)
    VALUES ('vapid_public', ${fresh.publicKey}), ('vapid_private', ${fresh.privateKey})
    ON CONFLICT (key) DO NOTHING
  `;

  // 競争に負けていた場合は、先に入ったほうを使う。
  const settled = (await read()) ?? fresh;
  cached = settled;
  return settled;
}

/** ブラウザに渡す公開鍵。 */
export async function vapidPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** この端末にお知らせを送ってよい、と登録する。 */
export async function saveSubscription(input: {
  clerkUserId: string;
  role: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO push_subscriptions (endpoint, clerk_user_id, role, p256dh, auth)
    VALUES (${input.endpoint}, ${input.clerkUserId}, ${input.role}, ${input.p256dh}, ${input.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      clerk_user_id = EXCLUDED.clerk_user_id,
      role          = EXCLUDED.role,
      p256dh        = EXCLUDED.p256dh,
      auth          = EXCLUDED.auth,
      failed_at     = NULL
  `;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

/** この人の端末が登録済みか。画面の表示を変えるために使う。 */
export async function hasSubscription(clerkUserId: string): Promise<boolean> {
  const sql = await db();
  const rows = (await sql`
    SELECT 1 FROM push_subscriptions WHERE clerk_user_id = ${clerkUserId} LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/**
 * 全員に送る。
 * 宛先が無効になっていたら（端末が消えた、許可を取り消した）その行を消す。
 */
async function sendToAll(title: string, body: string, url: string): Promise<number> {
  const sql = await db();
  const keys = await vapidKeys();
  webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);

  const targets = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
  `) as PushTarget[];

  const payload = JSON.stringify({ title, body, url });
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 / 410 は「その宛先はもう無い」という意味。消してよい。
        if (status === 404 || status === 410) dead.push(t.endpoint);
      }
    }),
  );

  if (dead.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ANY(${dead}::text[])`;
  }
  return sent;
}

/**
 * 節目を過ぎていれば送る。画面が現在値を取りに来るたびに呼ばれる。
 *
 * 送った記録を先に作り、作れたときだけ送る。開催日と節目の組を主キーに
 * しているので、何台が同時に来ても 1 台しか記録を作れない ＝ 二重に送らない。
 */
export async function sendDueNotices(event: EventSettings, now: Date = new Date()): Promise<void> {
  const due = dueMilestones(event, now);
  if (due.length === 0) return;

  const sql = await db();

  for (const id of due) {
    const claimed = (await sql`
      INSERT INTO sent_notices (event_date, milestone)
      VALUES (${event.eventDate}, ${id})
      ON CONFLICT (event_date, milestone) DO NOTHING
      RETURNING milestone
    `) as { milestone: string }[];

    if (claimed.length === 0) continue; // ほかが先に送った

    const spec = MILESTONES.find((m) => m.id === (id as Milestone));
    if (!spec) continue;

    try {
      await sendToAll(spec.title, spec.body, '/');
    } catch (error) {
      console.error('[push] 送信に失敗しました', error);
    }
  }
}
