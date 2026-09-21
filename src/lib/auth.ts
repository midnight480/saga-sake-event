/**
 * 役割（主催者 / 酒蔵 / 参加者）の判定。
 *
 * 認証そのものは Clerk に任せ、「その人が何者か」だけをここで決める。
 * 役割は Clerk の publicMetadata と DB の organizers 表の 2 か所に持つ:
 *   - publicMetadata … ミドルウェアやクライアントから追加の問い合わせなしで読める
 *   - organizers 表  … 主催者の名簿。Clerk 側が壊れても運営権限を復元できる
 *
 * Clerk の鍵が未設定でも例外を投げない。未設定なら「ログインしていない」と
 * 同じ扱いにして、/setup の案内画面へ送る。
 */

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';

import { getSql, hasDatabase } from './db';
import { originOf, resolveClerkPublishableKey, resolveClerkSecretKey } from './env';
import { ensureSchema } from './schema';

export type Role = 'organizer' | 'brewery' | 'guest';

export interface Viewer {
  userId: string;
  role: Role;
  /** role === 'brewery' のときだけ入る。 */
  breweryId?: string;
  email?: string;
}

/**
 * Clerk の鍵が両方そろっているか。
 *
 * 素の名前だけを見てはいけない。Vercel の連携で入れると
 * AUTHENTICATION_CLERK_SECRET_KEY のようにプレフィックスが付くうえ、
 * .env.example 由来の「中身が空の CLERK_SECRET_KEY」が別に作られていて、
 * 素の名前だけ見ると「設定済みなのに未設定」と判定してしまう。
 */
export function hasClerk(): boolean {
  return !!resolveClerkPublishableKey() && !!resolveClerkSecretKey();
}

/** 見つかった鍵。ClerkProvider や clerkMiddleware にそのまま渡す。 */
export function clerkKeys(): { publishableKey?: string; secretKey?: string } {
  return {
    publishableKey: resolveClerkPublishableKey()?.value,
    secretKey: resolveClerkSecretKey()?.value,
  };
}

/** どの名前で見つかったか。/setup の診断に出す。 */
export function clerkKeyNames(): { publishableKey?: string; secretKey?: string } {
  // 正規化で写したものなら、写し元の名前を見せる（切り分けに使うため）。
  const shown = (key?: string) => (key && originOf(key)) ?? key;
  return {
    publishableKey: shown(resolveClerkPublishableKey()?.key),
    secretKey: shown(resolveClerkSecretKey()?.key),
  };
}

/** .env の ORGANIZER_EMAILS。小文字にそろえて返す。 */
export function organizerEmailAllowlist(): string[] {
  return (process.env.ORGANIZER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * いまログインしている人を、役割まで解決して返す。
 * ログインしていない / Clerk 未設定なら null。
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!hasClerk()) return null;

  const { userId } = await auth();
  if (!userId) return null;

  // ★ セッションのトークンに publicMetadata は載っていない ★
  // Clerk は既定でそれをトークンに含めないので、そこから役割を読もうとすると
  // 常に空になり、蔵の担当者が参加者として扱われてしまう（実際に起きた）。
  // DB を正として引く。Clerk 側の設定に左右されないし、索引一本で済む。
  const breweryId = await findBreweryForUser(userId);
  if (breweryId) return { userId, role: 'brewery', breweryId };

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();

  if (await resolveOrganizer(userId, email)) {
    return { userId, role: 'organizer', email };
  }

  return { userId, role: 'guest', email };
}

/**
 * その人が担当する蔵。
 *
 * ★ store.ts を呼ばずに、ここで SQL を書いている ★
 * このファイルはミドルウェア（Edge ランタイム）からも読み込まれる。
 * store.ts は node:crypto を使うので、取り込むとビルドが壊れる。
 * 一文で済む問い合わせなので、依存を増やさずここに置く。
 *
 * DB が落ちていても画面は出したいので、失敗したら黙って null を返す。
 */
async function findBreweryForUser(userId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id FROM breweries WHERE clerk_user_id = ${userId} LIMIT 1
    `) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * この人が主催者かどうか。あわせて、まだ誰も主催者がいなければ
 * 最初にログインした人を主催者として登録する（初期設定を無くすため）。
 */
async function resolveOrganizer(userId: string, email?: string): Promise<boolean> {
  const allowlist = organizerEmailAllowlist();

  // 環境変数で明示されている場合は、DB を待たずに主催者とみなす。
  if (email && allowlist.includes(email)) {
    void rememberOrganizer(userId, email);
    return true;
  }

  if (!hasDatabase()) return false;

  try {
    await ensureSchema();
    const sql = getSql();

    const existing = await sql`
      SELECT clerk_user_id FROM organizers WHERE clerk_user_id = ${userId}
    `;
    if (existing.length > 0) return true;

    // 名簿が空 ＝ まだ誰も運営を引き受けていない。最初の人が主催者になる。
    // 許可リストが設定されているときは、そこに載っている人だけを待つ。
    if (allowlist.length === 0) {
      const claimed = await sql`
        INSERT INTO organizers (clerk_user_id, email)
        SELECT ${userId}, ${email ?? ''}
        WHERE NOT EXISTS (SELECT 1 FROM organizers)
        RETURNING clerk_user_id
      `;
      if (claimed.length > 0) {
        void syncRoleMetadata(userId, 'organizer');
        return true;
      }
    }
    return false;
  } catch {
    // DB が落ちていても「主催者ではない」と答えるだけにして、画面は出す。
    return false;
  }
}

async function rememberOrganizer(userId: string, email: string): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO organizers (clerk_user_id, email) VALUES (${userId}, ${email})
      ON CONFLICT (clerk_user_id) DO NOTHING
    `;
    void syncRoleMetadata(userId, 'organizer');
  } catch {
    // 記録できなくても許可リスト判定で毎回主催者になれるので、黙って続ける。
  }
}

/** Clerk 側にも役割を書いておく（クライアントから読めるようにするため）。 */
export async function syncRoleMetadata(
  userId: string,
  role: Role,
  breweryId?: string,
): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      publicMetadata: breweryId ? { role, breweryId } : { role },
    });
  } catch {
    // メタデータは高速化のための写しなので、失敗しても致命ではない。
  }
}

// ─────────────────────────────────────────────────────────────
// ページ・API から使う番人
// ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** ログイン必須。していなければ AuthError(401)。 */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError('ログインしてください。', 401);
  return viewer;
}

/** 主催者専用。 */
export async function requireOrganizer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== 'organizer') {
    throw new AuthError('主催者のみが操作できます。', 403);
  }
  return viewer;
}

/**
 * 酒蔵専用。主催者は任意の蔵として操作できる（当日の代理対応のため）。
 * 蔵アカウント本人は自分の蔵しか触れない。
 */
export async function requireBrewery(breweryId?: string): Promise<Viewer & { breweryId: string }> {
  const viewer = await requireViewer();

  if (viewer.role === 'brewery') {
    if (breweryId && breweryId !== viewer.breweryId) {
      throw new AuthError('ほかの蔵の情報は操作できません。', 403);
    }
    return { ...viewer, breweryId: viewer.breweryId! };
  }

  if (viewer.role === 'organizer' && breweryId) {
    return { ...viewer, breweryId };
  }

  throw new AuthError('蔵アカウントでログインしてください。', 403);
}
