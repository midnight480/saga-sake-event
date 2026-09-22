'use server';

/**
 * 画面から呼ぶ操作。
 *
 * 権限の確認はすべてここで行う（画面側のボタンを隠すだけでは守りにならない）。
 * 戻り値は必ず { ok } 形式にして、失敗の理由を日本語でそのまま画面に出せる形に
 * そろえている。例外を投げっぱなしにすると、主催者は当日「何か失敗した」しか
 * 分からず、自力で立て直せない。
 */

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

import { AuthError, requireBrewery, requireOrganizer, requireViewer, syncRoleMetadata } from '@/lib/auth';
import {
  type BottleSize,
  type Inquiry,
  type MessageAudience,
  type MessageRecipients,
  type Notice,
  type SentMessage,
  type EventPhase,
  type GuestKind,
  type RequestStatus,
} from '@/lib/domain';
import * as store from '@/lib/store';

export type ActionResult<T = undefined> =
  | { ok: true; value?: T; message?: string }
  | { ok: false; reason: string };

/** 例外を { ok:false } に変換する共通の包み。 */
async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, reason: error.message };
    console.error('[action]', error);
    return {
      ok: false,
      reason: '処理できませんでした。通信を確かめて、もう一度お試しください。',
    };
  }
}

function toAction<T>(result: store.Result<T>): ActionResult<T> {
  return result.ok ? { ok: true, value: result.value } : { ok: false, reason: result.reason };
}

/** 画面の再描画。ポーリングでも追いつくが、押した直後の反応を速くするため。 */
function refresh(): void {
  revalidatePath('/organizer', 'layout');
  revalidatePath('/brewery', 'layout');
  revalidatePath('/guest', 'layout');
}

// ═════════════════════════════════════════════════════════════
// 主催者
// ═════════════════════════════════════════════════════════════

export async function saveEvent(patch: {
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  targetBreweryCount?: number;
}): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.updateEvent(patch);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function setPhase(phase: EventPhase): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.updateEvent({ phase });
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

/**
 * 酒蔵を登録して、その蔵のログインアカウントを Clerk に作る。
 *
 * パスワードは「このとき 1 回だけ」返す。DB には保存しない。
 * 保存すれば一覧で何度でも見られて便利だが、30 蔵分の使えるパスワードを
 * こちらで抱えることになる。紛失時は再発行で足りるので、持たない方を選んだ。
 */
export async function addBrewery(input: {
  name: string;
  area?: string;
}): Promise<ActionResult<{ loginId: string; password: string; accountReady: boolean; warning?: string }>> {
  return run(async () => {
    await requireOrganizer();

    const created = await store.createBrewery(input);
    if (!created.ok) return { ok: false, reason: created.reason };

    const { id, loginId, password } = created.value;
    const account = await createBreweryAccount(id, loginId, password);

    refresh();
    return {
      ok: true,
      value: { loginId, password, accountReady: account.ok, warning: account.warning },
    };
  });
}

/**
 * 蔵アカウントに割り当てるメールアドレス。
 *
 * ★ なぜ要るのか ★
 * Clerk はメールアドレスを必須にしている設定が既定で、username と password
 * だけではユーザーを作れない。蔵の担当者は当日交代することもあり、個人の
 * メールアドレスを聞いて回るのは現実的でないので、こちらで一意な値を作る。
 *
 * 受信はしない。ログインは蔵IDとパスワードで行う。会場のドメインの下に
 * 置いて、何のアドレスか見て分かるようにしている。
 */
function breweryEmail(loginId: string): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || 'saga-sake-event.invalid';
  return `${loginId}@kura.${host}`;
}

/** Clerk が返した理由を、そのまま画面に出せる形に整える。 */
function clerkReason(error: unknown): string {
  const errors = (error as { errors?: { message?: string; longMessage?: string }[] })?.errors;
  const detail = errors?.map((e) => e.longMessage || e.message).filter(Boolean).join(' / ');
  if (detail) return detail;
  return error instanceof Error ? error.message : String(error);
}

/** 蔵用の Clerk ユーザーを作る。失敗しても蔵の登録自体は残す。 */
async function createBreweryAccount(
  breweryId: string,
  loginId: string,
  password: string,
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const client = await clerkClient();
    const user = await client.users.createUser({
      username: loginId,
      password,
      // メールアドレスが必須の設定でも作れるようにする。
      // 管理 API から作った宛先は確認済みとして登録される。
      emailAddress: [breweryEmail(loginId)],
      publicMetadata: { role: 'brewery', breweryId },
      skipPasswordChecks: false,
    });
    await store.linkBreweryClerkUser(breweryId, user.id);
    return { ok: true };
  } catch (error) {
    console.error('[clerk] 蔵アカウントを作成できませんでした', error);
    // 決めつけた案内をしない。前は「Username を有効にしてください」と出して
    // いたが、実際の原因が別のときに誤った方向へ誘導してしまう。
    return {
      ok: false,
      warning: `この蔵のログインアカウントを作れませんでした。理由: ${clerkReason(error)}`,
    };
  }
}

/**
 * パスワードを作り直す。
 * 当日、蔵の担当者が交代したときや、紙をなくしたときはこれで対応する。
 */
export async function regenerateBreweryPassword(
  breweryId: string,
): Promise<ActionResult<{ loginId: string; password: string }>> {
  return run(async () => {
    await requireOrganizer();

    const breweries = await store.listBreweries();
    const brewery = breweries.find((b) => b.id === breweryId);
    if (!brewery) return { ok: false, reason: 'その酒蔵は見つかりませんでした。' };

    const password = store.generatePassword();
    const clerkUserId = await store.getBreweryClerkUserId(breweryId);

    try {
      const client = await clerkClient();
      if (clerkUserId) {
        await client.users.updateUser(clerkUserId, { password, skipPasswordChecks: false });
      } else {
        // まだアカウントが無い蔵（作成に失敗していた）はここで作る。
        const created = await createBreweryAccount(breweryId, brewery.loginId, password);
        if (!created.ok) return { ok: false, reason: created.warning! };
      }
    } catch (error) {
      console.error('[clerk] パスワードを更新できませんでした', error);
      return {
        ok: false,
        reason: 'パスワードを変更できませんでした。しばらく待ってもう一度お試しください。',
      };
    }

    refresh();
    return { ok: true, value: { loginId: brewery.loginId, password } };
  });
}

export async function removeBrewery(breweryId: string): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();

    // Clerk 側のログインも一緒に消す。残すと消したはずの蔵が入れてしまう。
    const clerkUserId = await store.getBreweryClerkUserId(breweryId);
    if (clerkUserId) {
      try {
        const client = await clerkClient();
        await client.users.deleteUser(clerkUserId);
      } catch (error) {
        console.error('[clerk] 蔵アカウントを削除できませんでした', error);
      }
    }

    const result = await store.deleteBrewery(breweryId);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function moveBooth(breweryId: string, direction: 1 | -1): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.moveBooth(breweryId, direction);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function issueTickets(batchId: string, count: number): Promise<ActionResult<number>> {
  return run(async () => {
    await requireOrganizer();

    const batches = await store.listTicketBatches();
    if (!batches.some((b) => b.id === batchId)) {
      return { ok: false, reason: 'その券種は見つかりませんでした。' };
    }

    const result = await store.issueTickets(batchId, count);
    refresh();
    return toAction(result);
  });
}

// ═════════════════════════════════════════════════════════════
// 酒蔵
// ═════════════════════════════════════════════════════════════

export async function addBrand(input: {
  breweryId?: string;
  name: string;
  kind: string;
  polish: number;
  size: BottleSize;
  ticketCost: number;
  /** 任意の説明文と味わいの型（Issue #40）。 */
  description?: string;
  richness?: string;
  sweetness?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireBrewery(input.breweryId);
    const result = await store.addItem(viewer.breweryId, input);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

/** 銘柄の操作は、その銘柄を持つ蔵だけに許す。 */
async function requireItemOwner(itemId: string): Promise<void> {
  const breweries = await store.listBreweries();
  const owner = breweries.find((b) => b.items.some((i) => i.id === itemId));
  if (!owner) throw new AuthError('その銘柄は見つかりませんでした。', 404);
  await requireBrewery(owner.id);
}

export async function changeBottles(itemId: string, delta: number): Promise<ActionResult> {
  return run(async () => {
    await requireItemOwner(itemId);
    const result = await store.changeBottles(itemId, delta);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

/** 銘柄の説明と味わいの型を書き直す（Issue #40）。持ち主の蔵（と主催者）だけ。 */
export async function setBrandProfile(
  itemId: string,
  input: { description: string; richness: string; sweetness: string },
): Promise<ActionResult> {
  return run(async () => {
    await requireItemOwner(itemId);
    const result = await store.setItemProfile(itemId, input);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function setTicketCost(itemId: string, ticketCost: number): Promise<ActionResult> {
  return run(async () => {
    await requireItemOwner(itemId);
    const result = await store.setItemTicketCost(itemId, ticketCost);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function removeBrand(itemId: string): Promise<ActionResult> {
  return run(async () => {
    await requireItemOwner(itemId);
    const result = await store.removeItem(itemId);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function setAccepting(
  accepting: boolean,
  breweryId?: string,
): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireBrewery(breweryId);
    const result = await store.setAccepting(viewer.breweryId, accepting);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

/** 銘柄ごとの受付を止める／再開する（Issue #43）。持ち主の蔵（と主催者）だけ。 */
export async function setBrandAccepting(itemId: string, accepting: boolean): Promise<ActionResult> {
  return run(async () => {
    await requireItemOwner(itemId);
    const result = await store.setItemAccepting(itemId, accepting);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

export async function setRequestStatus(
  requestId: number,
  to: RequestStatus,
): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();

    // 蔵は自分の注文だけ。主催者は当日の代理対応があるので全件を触れる。
    const guard = viewer.role === 'brewery' ? { breweryId: viewer.breweryId } : {};
    if (viewer.role === 'guest') {
      return { ok: false, reason: '注文の状態は蔵と主催者だけが変更できます。' };
    }

    const result = await store.setRequestStatus(requestId, to, guard);
    refresh();

    // できあがったら、頼んだ本人のスマホに知らせる（Issue #35）。
    // 送信は応答のあとに回す。通知の配信サービスが遅くても、蔵の画面を
    // 待たせないため。after() はその間 関数を生かしておいてくれる。
    if (result.ok && to === 'ready') {
      after(async () => {
        try {
          const { sendReadyNotice } = await import('@/lib/push');
          await sendReadyNotice(requestId);
        } catch (error) {
          console.error('[push] 準備完了の通知に失敗しました', error);
        }
      });
    }

    // 受け取ったことも本人に知らせる（Issue #66）。押すと記録の画面が開く。
    if (result.ok && to === 'delivered') {
      after(async () => {
        try {
          const { sendDeliveredNotice } = await import('@/lib/push');
          await sendDeliveredNotice(requestId);
        } catch (error) {
          console.error('[push] 受渡完了の通知に失敗しました', error);
        }
      });
    }

    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

// ═════════════════════════════════════════════════════════════
// 参加者
// ═════════════════════════════════════════════════════════════

export async function order(itemId: string, cups: number): Promise<ActionResult<{ spent: number }>> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role !== 'guest') {
      return { ok: false, reason: '注文は参加者アカウントから行ってください。' };
    }

    const result = await store.createRequest({ clerkUserId: viewer.userId, itemId, cups });
    refresh();

    // 蔵のスマホに知らせる（Issue #51）。参加者の画面は待たせない。
    if (result.ok) {
      const requestId = result.value.id;
      after(async () => {
        try {
          const { sendNewRequestNotice } = await import('@/lib/push');
          await sendNewRequestNotice(requestId);
        } catch (error) {
          console.error('[push] 新しいリクエストの通知に失敗しました', error);
        }
      });
    }

    return result.ok ? { ok: true, value: { spent: result.value.spent } } : { ok: false, reason: result.reason };
  });
}

export async function redeemTicket(
  code: string,
): Promise<ActionResult<{ added: number; total: number; label: string }>> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role !== 'guest') {
      return { ok: false, reason: 'チケットの追加は参加者アカウントから行ってください。' };
    }

    // 参加者として初めて触るときは、先に台帳を作っておく。
    await store.getOrCreateGuest(viewer.userId);

    const result = await store.redeemTicket(code, viewer.userId);
    refresh();
    return toAction(result);
  });
}

// ═════════════════════════════════════════════════════════════
// 酒蔵のログイン
// ═════════════════════════════════════════════════════════════

/**
 * 蔵IDとパスワードでログインする。
 *
 * ★ なぜ Clerk の標準のログイン画面を使わないのか ★
 * 蔵アカウントには受信できないメールアドレスを割り当てている。標準の画面で
 * ログインしようとすると、Clerk が「新しいデバイスからのサインイン」を
 * 検知して、そのアドレス宛に確認コードを送ってしまう。届かないので、蔵は
 * 永久に入れない。
 *
 * そこでパスワードの照合をサーバー側で行い、通ったらサインイン用の
 * 引換券（sign-in token）を発行して、その URL へ送る。対話的な確認は
 * 一切入らない。照合も発行も Clerk の管理 API なので、認証の土台は
 * Clerk のままである。
 */
export async function signInBrewery(
  loginId: string,
  password: string,
): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const id = loginId.trim().toLowerCase();
    if (!id || !password) return { ok: false, reason: '蔵IDとパスワードを入れてください。' };

    const brewery = (await store.listBreweries()).find((b) => b.loginId.toLowerCase() === id);
    // 蔵が無い場合も、パスワード違いと同じ文言にする。
    // 蔵IDが実在するかどうかを、総当たりで探れないようにするため。
    const wrong = { ok: false as const, reason: '蔵IDかパスワードが違います。' };
    if (!brewery) return wrong;

    const clerkUserId = await store.getBreweryClerkUserId(brewery.id);
    if (!clerkUserId) {
      return {
        ok: false,
        reason: 'この蔵のログインアカウントがまだ作られていません。主催者にお伝えください。',
      };
    }

    const client = await clerkClient();

    try {
      const result = await client.users.verifyPassword({ userId: clerkUserId, password });
      if (!result.verified) return wrong;
    } catch {
      // 回数超過などで弾かれた場合もここに来る。
      return wrong;
    }

    try {
      const token = await client.signInTokens.createSignInToken({
        userId: clerkUserId,
        // 押してから移動するまでの数十秒あれば足りる。短くして漏えい時の窓を狭める。
        expiresInSeconds: 120,
      });
      // 引換券は Clerk のログイン画面が受け取って処理する。参加者向けの画面を
      // 一瞬通るが、操作は要らず、そのまま蔵の画面へ抜ける。
      const ticket = encodeURIComponent(token.token);
      return {
        ok: true,
        value: { url: `/sign-in?__clerk_ticket=${ticket}&redirect_url=${encodeURIComponent('/brewery')}` },
      };
    } catch (error) {
      console.error('[clerk] サインイン用の引換券を作れませんでした', error);
      return { ok: false, reason: 'ログインできませんでした。しばらく待ってお試しください。' };
    }
  });
}

// ═════════════════════════════════════════════════════════════
// 問い合わせ
// ═════════════════════════════════════════════════════════════

/** 蔵・参加者から主催者へ。件名は省略できる。 */
export async function sendInquiry(input: {
  subject: string;
  body: string;
}): Promise<ActionResult<{ id: number }>> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role === 'organizer') {
      return { ok: false, reason: '主催者は問い合わせを送れません。' };
    }

    // 誰からの問い合わせかを、受け取った側がすぐ分かる形にしておく。
    let label = '参加者';
    if (viewer.role === 'brewery') {
      const brewery = (await store.listBreweries()).find((b) => b.id === viewer.breweryId);
      label = brewery ? brewery.name : '酒蔵';
    } else {
      const guest = await store.getOrCreateGuest(viewer.userId);
      label = guest.displayNo;
    }

    const result = await store.createInquiry({
      clerkUserId: viewer.userId,
      role: viewer.role,
      label,
      breweryId: viewer.role === 'brewery' ? viewer.breweryId : undefined,
      subject: input.subject,
      body: input.body,
    });
    refresh();
    return toAction(result);
  });
}

// ═════════════════════════════════════════════════════════════
// お知らせの履歴（右上の 🔔）。役割を問わず、本人のぶんだけ。
// ═════════════════════════════════════════════════════════════

export async function fetchNotices(): Promise<ActionResult<Notice[]>> {
  return run(async () => {
    const viewer = await requireViewer();
    return { ok: true, value: await store.listNotices(viewer.userId, viewer.role) };
  });
}

export async function markNoticeRead(noticeId: number): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await store.markNoticeRead(viewer.userId, viewer.role, noticeId);
    return { ok: true };
  });
}

export async function markAllNoticesRead(): Promise<ActionResult<number>> {
  return run(async () => {
    const viewer = await requireViewer();
    return { ok: true, value: await store.markAllNoticesRead(viewer.userId, viewer.role) };
  });
}

// ═════════════════════════════════════════════════════════════
// 主催者からの配信（Issue #54）。全酒蔵・全参加者・その両方にだけ。
// ═════════════════════════════════════════════════════════════

export async function sendBroadcast(input: {
  audience: string;
  title: string;
  body: string;
}): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.broadcastMessage(input);
    if (!result.ok) return { ok: false, reason: result.reason };

    // スマホの通知は応答のあとに送る。宛先が多くても、主催者の画面を待たせない。
    const noticeId = result.value.id;
    after(async () => {
      try {
        const { sendMessageNotice } = await import('@/lib/push');
        await sendMessageNotice(noticeId);
      } catch (error) {
        console.error('[push] 配信の通知に失敗しました', error);
      }
    });

    refresh();
    return { ok: true };
  });
}

export async function fetchSentMessages(): Promise<ActionResult<SentMessage[]>> {
  return run(async () => {
    await requireOrganizer();
    return { ok: true, value: await store.listSentMessages() };
  });
}

export async function fetchMessageRecipients(): Promise<
  ActionResult<Record<MessageAudience, MessageRecipients>>
> {
  return run(async () => {
    await requireOrganizer();
    return { ok: true, value: await store.countMessageRecipients() };
  });
}

/**
 * 利用規約・プライバシーポリシーに同意する（Issue #64）。
 * 受け取るのは画面が表示していた版。表示中に本文が改められていたら（版が違えば）断り、
 * 新しい本文をもう一度読んでもらう。
 */
export async function agreeToLegal(version: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const { LEGAL_VERSION } = await import('@/lib/legal');
    if (version !== LEGAL_VERSION) {
      return { ok: false, reason: '利用規約が新しくなりました。画面を更新して、もう一度お読みください。' };
    }
    await store.recordConsent(viewer.userId, LEGAL_VERSION);
    return { ok: true };
  });
}

/** 自分が出した問い合わせと、その返事。 */
export async function fetchMyInquiries(): Promise<ActionResult<Inquiry[]>> {
  return run(async () => {
    const viewer = await requireViewer();
    return { ok: true, value: await store.listMyInquiries(viewer.userId) };
  });
}

/** 主催者が見る一覧。未回答が先に並ぶ。 */
export async function fetchInquiries(): Promise<ActionResult<Inquiry[]>> {
  return run(async () => {
    await requireOrganizer();
    return { ok: true, value: await store.listInquiries() };
  });
}

/** 主催者が返事を書く。書き直しもできる。 */
export async function replyToInquiry(id: number, answer: string): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.answerInquiry(id, answer);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

// ═════════════════════════════════════════════════════════════
// お知らせ（Web Push）
// ═════════════════════════════════════════════════════════════

/** ブラウザに渡す公開鍵。無ければその場で作られる。 */
export async function getPushPublicKey(): Promise<ActionResult<string>> {
  return run(async () => {
    await requireViewer();
    const { vapidPublicKey } = await import('@/lib/push');
    return { ok: true, value: await vapidPublicKey() };
  });
}

/** この端末にお知らせを送ってよい、と登録する。 */
export async function subscribeToPush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const { saveSubscription } = await import('@/lib/push');
    await saveSubscription({ ...input, clerkUserId: viewer.userId, role: viewer.role });
    return { ok: true };
  });
}

/** 受け取りをやめる。 */
export async function unsubscribeFromPush(endpoint: string): Promise<ActionResult> {
  return run(async () => {
    await requireViewer();
    const { removeSubscription } = await import('@/lib/push');
    await removeSubscription(endpoint);
    return { ok: true };
  });
}

/** 参加者としてログインした直後に、台帳と役割メタデータを整える。 */
export async function ensureGuestRegistered(): Promise<ActionResult<{ kindChosen: boolean }>> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role !== 'guest') return { ok: true, value: { kindChosen: true } };

    const guest = await store.getOrCreateGuest(viewer.userId);
    void syncRoleMetadata(viewer.userId, 'guest');

    // まだ一度もチケットを配っていない人は、参加区分の選択が済んでいない。
    return { ok: true, value: { kindChosen: guest.tickets > 0 || guest.used > 0 } };
  });
}

/**
 * 全蔵のパスワードをまとめて作り直す。
 *
 * 配布前の一括印刷のための操作。すでに配った紙は全部使えなくなるので、
 * 画面側で必ず確認を取ってから呼ぶ。
 */
export async function regenerateAllBreweryPasswords(): Promise<
  ActionResult<{ name: string; area: string; booth: string; loginId: string; password: string; failed?: boolean }[]>
> {
  return run(async () => {
    await requireOrganizer();

    const breweries = await store.listBreweries();
    const rows: {
      name: string;
      area: string;
      booth: string;
      loginId: string;
      password: string;
      failed?: boolean;
    }[] = [];

    for (const brewery of breweries) {
      const result = await regenerateBreweryPassword(brewery.id);
      rows.push({
        name: brewery.name,
        area: brewery.area,
        booth: brewery.booth,
        loginId: brewery.loginId,
        password: result.ok && result.value ? result.value.password : '（発行できませんでした）',
        failed: !result.ok,
      });
    }

    return { ok: true, value: rows };
  });
}

/**
 * 券 1 枚で何枚分のチケットになるかを変える。
 * 前売券と当日券で違う枚数にできる（例: 前売 12 枚、当日 10 枚）。
 */
export async function setCupsPerTicket(batchId: string, cups: number): Promise<ActionResult> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.setCupsPerTicket(batchId, cups);
    refresh();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

/** 用意する券の枚数を「この数にする」形で決める。差分はこちらで埋める。 */
export async function setTicketCount(
  batchId: string,
  target: number,
): Promise<ActionResult<{ issued: number; added: number; removed: number }>> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.setTicketCount(batchId, target);
    refresh();
    return toAction(result);
  });
}

/**
 * 予行演習用のデータを入れる。
 *
 * 当日と同じ形のデータを一度に作って、画面の見え方と流れを確かめるためのもの。
 * 空の画面を眺めても、混雑の色や在庫のバー、応答遅延の警告がどう出るかは
 * 分からない。実在する佐賀の酒蔵と銘柄を使っているのも、当日の感覚を掴む
 * ためである。
 *
 * 蔵のログインアカウントは本番と同じ手順で作るので、発行された蔵IDと
 * パスワードでそのままログインして試せる。
 */
export async function seedRehearsalData(): Promise<
  ActionResult<{
    breweries: { name: string; loginId: string; password: string; accountReady: boolean }[];
    items: number;
    guests: number;
    orders: number;
  }>
> {
  return run(async () => {
    await requireOrganizer();

    const { REHEARSAL_BREWERIES, REHEARSAL_GUESTS, REHEARSAL_ORDERS } = await import(
      '@/lib/rehearsal'
    );

    const created: {
      id: string;
      name: string;
      loginId: string;
      password: string;
      accountReady: boolean;
      itemIds: string[];
    }[] = [];

    for (const spec of REHEARSAL_BREWERIES) {
      const brewery = await store.createBrewery({ name: spec.name });
      if (!brewery.ok) return { ok: false, reason: `${spec.name}: ${brewery.reason}` };

      const { id, loginId, password } = brewery.value;
      const account = await createBreweryAccount(id, loginId, password);
      const itemIds = await store.seedItems(id, spec.items);

      if (spec.paused) await store.setAccepting(id, false);

      created.push({ id, name: spec.name, loginId, password, accountReady: account.ok, itemIds });
    }

    for (const guest of REHEARSAL_GUESTS) {
      await store.seedGuest(guest.id, guest.label, guest.points);
    }

    let orders = 0;
    for (const order of REHEARSAL_ORDERS) {
      const brewery = created[order.brewery];
      const spec = REHEARSAL_BREWERIES[order.brewery].items[order.item];
      const guest = REHEARSAL_GUESTS[order.guest];
      if (!brewery || !spec || !guest) continue;

      await store.seedRequest({
        guestClerkId: guest.id,
        guestLabel: guest.label,
        breweryId: brewery.id,
        itemId: brewery.itemIds[order.item],
        brand: spec.name,
        cups: order.cups,
        ticketCost: spec.ticketCost * order.cups,
        status: order.status,
        minutesAgo: order.minutesAgo,
      });
      orders += 1;
    }

    refresh();
    return {
      ok: true,
      value: {
        breweries: created.map(({ name, loginId, password, accountReady }) => ({
          name,
          loginId,
          password,
          accountReady,
        })),
        items: created.reduce((sum, b) => sum + b.itemIds.length, 0),
        guests: REHEARSAL_GUESTS.length,
        orders,
      },
    };
  });
}

/**
 * 次のイベントのために片付ける。
 * 何が消えて何が残るかは store.resetEvent に書いてある。
 */
export async function resetEvent(): Promise<ActionResult<store.ResetCounts>> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.resetEvent();
    refresh();
    return toAction(result);
  });
}

/**
 * 読み取り済みも含めて、その券種の券をすべて消す。
 * 次のイベントを始めるときに、1 枚あたりのポイントを変えられるようにするための操作。
 */
export async function discardAllTickets(
  batchId: string,
): Promise<ActionResult<{ removed: number; redeemed: number }>> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.discardAllTickets(batchId);
    refresh();
    return toAction(result);
  });
}

/** 発行した券をまとめて取り消す（まだ読み取られていないものだけ）。 */
export async function discardTickets(batchId: string): Promise<ActionResult<number>> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.discardTickets(batchId);
    refresh();
    return toAction(result);
  });
}

/** 券のコードを、使われたかどうかとあわせて取り出す。 */
export async function fetchTickets(
  batchId: string,
  limit = 500,
): Promise<ActionResult<{ code: string; redeemed: boolean }[]>> {
  return run(async () => {
    await requireOrganizer();
    return { ok: true, value: await store.listTickets(batchId, limit) };
  });
}

/** 印刷用に、まだ読み取られていない券コードを取り出す。 */
export async function fetchUnredeemedCodes(
  batchId: string,
  limit = 200,
): Promise<ActionResult<string[]>> {
  return run(async () => {
    await requireOrganizer();
    const codes = await store.listUnredeemedCodes(batchId, limit);
    return { ok: true, value: codes };
  });
}
