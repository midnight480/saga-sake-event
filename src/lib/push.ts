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

/** 通知の中身。sw.js がこの形を受け取って表示する。 */
interface NoticePayload {
  title: string;
  body: string;
  /** 押したときに開く画面。 */
  url: string;
  /** 同じ tag の通知は重ならず、新しいほうに置き換わる。 */
  tag?: string;
  /**
   * 押すか閉じるまで、通知を出したままにする。数秒で引っ込むと、手がふさがって
   * いる間に見逃す。効くのはパソコンの Chrome・Edge（Android は通知欄に残るが、
   * 画面の上に出る帯は数秒で消える。iPhone は対応していない）。
   */
  requireInteraction?: boolean;
  /** 振動のしかた（ミリ秒で、振動・休み・振動…）。Android のみ。 */
  vibrate?: number[];
}

/**
 * 蔵に新しいリクエストを知らせるときの振動。
 * ふだんの通知（短く 1〜2 回）と区別できるよう、長め・3 回にする。
 */
export const NEW_REQUEST_VIBRATION = [500, 200, 500, 200, 900];

/**
 * 決まった宛先に送る。
 * 宛先が無効になっていたら（端末が消えた、許可を取り消した）その行を消す。
 */
async function sendTo(targets: PushTarget[], notice: NoticePayload): Promise<number> {
  if (targets.length === 0) return 0;

  const sql = await db();
  const keys = await vapidKeys();
  webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);

  const payload = JSON.stringify(notice);
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

/** 登録している全員に送る。節目のお知らせで使う。 */
async function sendToAll(title: string, body: string, url: string): Promise<number> {
  const sql = await db();
  const targets = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
  `) as PushTarget[];
  return sendTo(targets, { title, body, url });
}

/**
 * 注文したお酒ができあがったことを、頼んだ本人の端末にだけ知らせる（Issue #35）。
 *
 * 画面の文言は 4 秒ごとに変わるが、スマホをポケットに入れていれば気づけない。
 * 蔵の前に杯が置かれたままになると、取り違えや温度の変化が起きる。
 *
 * 呼ぶのは、蔵が「準備完了」に進めるのに成功したときだけ（actions.ts）。
 * 状態の更新は「いまの状態が準備中なら」を条件にした 1 文なので、同じ注文で
 * 2 回成功することはなく、二重には届かない。
 */
export async function sendReadyNotice(requestId: number): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    SELECT r.guest_clerk_id, r.brand, r.cups, b.name AS brewery_name
    FROM requests r
    JOIN breweries b ON b.id = r.brewery_id
    WHERE r.id = ${requestId} AND r.status = 'ready'
  `) as { guest_clerk_id: string; brand: string; cups: number; brewery_name: string }[];

  // 送る前に取り消された、など。できあがっていないものは知らせない。
  const request = rows[0];
  if (!request) return 0;

  const notice = {
    title: 'できあがりました',
    body: `${request.brewery_name}の「${request.brand}」（${request.cups} 杯）を、ブースで受け取ってください。`,
    url: '/guest',
  };

  // 先に 🔔 の履歴へ残す。通知を許可していない人・iPhone でホーム画面に
  // 追加していない人にも、アプリの中では必ず見えるようにするため。
  await sql`
    INSERT INTO notices (clerk_user_id, kind, title, body, url)
    VALUES (${request.guest_clerk_id}, 'ready', ${notice.title}, ${notice.body}, ${notice.url})
  `;

  const targets = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE clerk_user_id = ${request.guest_clerk_id}
  `) as PushTarget[];

  return sendTo(targets, { ...notice, tag: `ready-${requestId}` });
}

/**
 * 新しいリクエストを、その蔵の端末に知らせる（Issue #51）。
 *
 * 蔵の担当者は注いだり渡したりで手がふさがっていて、画面を見ていないことが
 * 多い。スマホをしまっていても気づけるよう、OS の通知でも送る（画面の側では
 * 音・振動・帯でも知らせる。components/NewRequestAlert）。
 *
 * 🔔 の履歴には残さない。蔵にとってリクエストの履歴は受付キューそのもので、
 * 1 件ごとに残すと未読の数が増え続けて、本当に見てほしいお知らせが埋もれる。
 *
 * 呼ぶのは注文が通ったときだけ（actions.ts の order）。1 回の注文で 1 回。
 */
export async function sendNewRequestNotice(requestId: number): Promise<number> {
  const sql = await db();
  const rows = (await sql`
    SELECT r.brand, r.cups, r.guest_label, b.clerk_user_id
    FROM requests r
    JOIN breweries b ON b.id = r.brewery_id
    WHERE r.id = ${requestId} AND r.status = 'accepted'
  `) as { brand: string; cups: number; guest_label: string; clerk_user_id: string | null }[];

  // 送る前に取り消された、蔵のアカウントがまだ無い、など。
  const request = rows[0];
  if (!request?.clerk_user_id) return 0;

  const targets = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE clerk_user_id = ${request.clerk_user_id}
  `) as PushTarget[];

  return sendTo(targets, {
    title: '新しいリクエスト',
    body: `「${request.brand}」${request.cups} 杯 ・ ${request.guest_label}`,
    url: '/brewery',
    tag: `request-${requestId}`,
    // 手がふさがっていても見逃さないよう、消えずに残し、独自の振動で知らせる。
    requireInteraction: true,
    vibrate: NEW_REQUEST_VIBRATION,
  });
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

    // 🔔 の履歴にも残す。全員あてなので宛先は空（NULL）。
    // 記録を作れた 1 台だけがここに来るので、履歴も 1 件しかできない。
    await sql`
      INSERT INTO notices (clerk_user_id, kind, title, body, url)
      VALUES (NULL, 'milestone', ${spec.title}, ${spec.body}, '/')
    `;

    try {
      await sendToAll(spec.title, spec.body, '/');
    } catch (error) {
      console.error('[push] 送信に失敗しました', error);
    }
  }
}
