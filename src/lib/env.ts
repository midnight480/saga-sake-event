/**
 * 環境変数の名前ゆれを吸収する。
 *
 * ★ なぜ必要か ★
 * Vercel Marketplace から Neon と Clerk を追加すると、変数名に
 * 「製品カテゴリ名」のプレフィックスが付く。実際にこうなった。
 *
 *   Neon  → STORAGE_POSTGRES_URL, STORAGE_DATABASE_URL_UNPOOLED, ...
 *   Clerk → AUTHENTICATION_CLERK_SECRET_KEY,
 *           NEXT_PUBLIC_AUTHENTICATION_CLERK_PUBLISHABLE_KEY
 *
 * アプリが DATABASE_URL / CLERK_SECRET_KEY しか見ていないと、正しく追加した
 * のに「未設定」と表示され続ける。しかも .env.example があると Vercel が
 * 同名の空の変数を作るので、「名前はあるのに中身が空」という、いちばん
 * 気づきにくい形になる。初めて触る人はここで確実に詰まる。
 *
 * そこで「決め打ちの候補」で拾いきれなかった場合に備えて、末尾が一致する
 * 変数を探しにいく。プレフィックスを自分で変えた人でも動くようにするため。
 */

/** 空文字・空白だけの値は「設定されていない」とみなす。 */
function valueOf(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export interface Resolved {
  value: string;
  /** どの名前で見つかったか。/setup の診断に出す。 */
  key: string;
}

/**
 * 候補の名前を順に見て、最初に中身が入っていたものを返す。
 * 見つからなければ、末尾が suffixes のいずれかに一致する変数を探す。
 */
function resolve(exact: string[], suffixes: string[]): Resolved | undefined {
  for (const key of exact) {
    const value = valueOf(key);
    if (value) return { value, key };
  }

  // プレフィックスは利用者が自由に付けられるので、末尾で拾う。
  // 名前順にそろえて、同じ環境なら毎回同じ変数が選ばれるようにする。
  for (const suffix of suffixes) {
    const match = Object.keys(process.env)
      .filter((key) => key.endsWith(suffix))
      .sort()
      .find((key) => valueOf(key));
    if (match) return { value: valueOf(match)!, key: match };
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────
// データベース
// ─────────────────────────────────────────────────────────────

/**
 * 接続文字列。プール経由のものを優先する。
 * 末尾一致より前に、プール版を明示的に並べているのはそのため。
 */
export function resolveDatabaseUrl(): Resolved | undefined {
  return resolve(
    [
      'DATABASE_URL',
      'POSTGRES_URL',
      'STORAGE_DATABASE_URL',
      'STORAGE_POSTGRES_URL',
      // ここから下はプールを通らない接続。上が無いときだけ使う。
      'DATABASE_URL_UNPOOLED',
      'POSTGRES_URL_NON_POOLING',
      'STORAGE_DATABASE_URL_UNPOOLED',
      'STORAGE_POSTGRES_URL_NON_POOLING',
    ],
    ['_DATABASE_URL', '_POSTGRES_URL', '_DATABASE_URL_UNPOOLED', '_POSTGRES_URL_NON_POOLING'],
  );
}

// ─────────────────────────────────────────────────────────────
// Clerk
// ─────────────────────────────────────────────────────────────

export function resolveClerkSecretKey(): Resolved | undefined {
  return resolve(
    ['CLERK_SECRET_KEY', 'AUTHENTICATION_CLERK_SECRET_KEY'],
    ['_CLERK_SECRET_KEY'],
  );
}

export function resolveClerkPublishableKey(): Resolved | undefined {
  return resolve(
    [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_AUTHENTICATION_CLERK_PUBLISHABLE_KEY',
      'CLERK_PUBLISHABLE_KEY',
    ],
    ['_CLERK_PUBLISHABLE_KEY'],
  );
}

// ─────────────────────────────────────────────────────────────
// 正規化
// ─────────────────────────────────────────────────────────────

/**
 * 見つけた値を、素の名前にも書き戻す。
 *
 * Clerk の auth() や clerkClient() は自分で process.env を読みにいくので、
 * こちらから鍵を渡せない経路がある。そのための補い。
 * ClerkProvider と clerkMiddleware には別途はっきり渡しているので、
 * ここが効かなくても動くようにしてある（二重の備え）。
 *
 * 何度呼んでも同じ結果になる。すでに中身がある変数は書き換えない。
 */
/**
 * 正規化のときに「どの名前から写したか」を覚えておく。
 * 書き戻したあとに探し直すと、写し先の素の名前しか分からず、
 * 「設定したのに未設定と出る」の切り分けに使えなくなるため。
 */
const origins = new Map<string, string>();

/**
 * その素の名前が、もともとどの変数から来たか。
 *
 * 記録を引くだけでは足りない。正規化は instrumentation と描画側の両方で
 * 走るが、両者はモジュールの実体が別なので、先に走ったほうの記録しか残らない。
 * そこで記録が無ければ「同じ値を持つ別名」を探す。診断に出すためだけの処理。
 */
export function originOf(canonicalKey: string): string | undefined {
  const recorded = origins.get(canonicalKey);
  if (recorded) return recorded;

  const value = valueOf(canonicalKey);
  if (!value) return undefined;

  return Object.keys(process.env)
    .filter((key) => key !== canonicalKey && valueOf(key) === value)
    .sort()[0];
}

export function normalizeEnv(): void {
  const assign = (key: string, resolved: Resolved | undefined) => {
    if (!resolved) return;
    if (valueOf(key)) return; // すでに入っているものは触らない
    process.env[key] = resolved.value;
    origins.set(key, resolved.key);
  };

  assign('DATABASE_URL', resolveDatabaseUrl());
  assign('CLERK_SECRET_KEY', resolveClerkSecretKey());
  assign('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', resolveClerkPublishableKey());
}
