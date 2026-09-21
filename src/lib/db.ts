/**
 * DB 接続。
 *
 * 環境変数が無い状態でもアプリが「落ちずに起動して案内画面を出す」ことを
 * 最優先にしている。だから接続はモジュール読み込み時ではなく、実際に使う
 * 瞬間まで遅らせる（getSql）。ここが崩れると、主催者は真っ白なエラー画面を
 * 見ることになり、自力で復帰できない。
 */

import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';

import { originOf, resolveDatabaseUrl } from './env';

/**
 * 接続文字列を探す。名前の候補は env.ts にまとめてある
 * （Vercel の連携は STORAGE_POSTGRES_URL のようにプレフィックスを付けるため）。
 */
export function databaseUrl(): string | undefined {
  return resolveDatabaseUrl()?.value;
}

/** どの名前で見つかったか。/setup の診断に出す。 */
export function databaseUrlKey(): string | undefined {
  const key = resolveDatabaseUrl()?.key;
  // 正規化で写したものなら、写し元の名前を見せる。
  return (key && originOf(key)) ?? key;
}

export function hasDatabase(): boolean {
  return databaseUrl() !== undefined;
}

/**
 * 開発時に、Neon 以外の Postgres へつなぐための逃げ道。
 *
 * このドライバは Neon の HTTP 口とだけ話すので、そのままではローカルの
 * Postgres を相手にできない。NEON_FETCH_ENDPOINT に同じ形式を話す中継を
 * 立てれば、Neon のアカウントが無くてもアプリ全体を動かして確かめられる。
 * 本番ではこの環境変数を設定しないため、経路は一切変わらない。
 */
const fetchEndpoint = process.env.NEON_FETCH_ENDPOINT?.trim();
if (fetchEndpoint) neonConfig.fetchEndpoint = fetchEndpoint;

let client: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL が設定されていません。/setup を開いて案内に従ってください。',
    );
  }
  if (!client) client = neon(url);
  return client;
}
