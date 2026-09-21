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
import { clerkClient } from '@clerk/nextjs/server';

import { AuthError, requireBrewery, requireOrganizer, requireViewer, syncRoleMetadata } from '@/lib/auth';
import {
  INITIAL_TICKETS,
  type BottleSize,
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
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  });
}

// ═════════════════════════════════════════════════════════════
// 参加者
// ═════════════════════════════════════════════════════════════

/**
 * 参加区分を決める。
 * 「酒蔵特別枠」は主催者が配る招待コードが要る。合っていれば枠と初期枚数を変える。
 */
export async function chooseGuestKind(
  kind: GuestKind,
  inviteCode?: string,
): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role !== 'guest') {
      return { ok: false, reason: 'この操作は参加者のみが行えます。' };
    }

    if (kind === '酒蔵特別枠') {
      const expected = process.env.BREWERY_GUEST_INVITE_CODE?.trim();
      if (!expected) {
        return { ok: false, reason: '酒蔵特別枠はいま受け付けていません。' };
      }
      if ((inviteCode ?? '').trim() !== expected) {
        return { ok: false, reason: '招待コードが違います。主催者に確認してください。' };
      }
    }

    const result = await store.setGuestKind(viewer.userId, kind);
    if (!result.ok) return { ok: false, reason: result.reason };

    // 区分が決まった時点で、その区分の初期枚数を配る（まだ 0 枚のときだけ）。
    await grantInitialTickets(viewer.userId, kind);

    refresh();
    return { ok: true };
  });
}

/**
 * 初回のチケットを配る。
 * すでに 1 枚でも持っている / 使っている人には配らない（二重配布の防止）。
 */
async function grantInitialTickets(clerkUserId: string, kind: GuestKind): Promise<void> {
  const guest = await store.getOrCreateGuest(clerkUserId);
  if (guest.tickets > 0 || guest.used > 0) return;

  const amount = INITIAL_TICKETS[kind];
  const { getSql } = await import('@/lib/db');
  const sql = getSql();
  await sql`
    UPDATE guests SET tickets = ${amount}
    WHERE clerk_user_id = ${clerkUserId} AND tickets = 0 AND used = 0
  `;
}

export async function order(itemId: string, cups: number): Promise<ActionResult<{ spent: number }>> {
  return run(async () => {
    const viewer = await requireViewer();
    if (viewer.role !== 'guest') {
      return { ok: false, reason: '注文は参加者アカウントから行ってください。' };
    }

    const result = await store.createRequest({ clerkUserId: viewer.userId, itemId, cups });
    refresh();
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

/** 発行した券をまとめて取り消す（まだ読み取られていないものだけ）。 */
export async function discardTickets(batchId: string): Promise<ActionResult<number>> {
  return run(async () => {
    await requireOrganizer();
    const result = await store.discardTickets(batchId);
    refresh();
    return toAction(result);
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
