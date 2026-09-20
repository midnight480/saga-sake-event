/**
 * DB 接続。
 *
 * 環境変数が無い状態でもアプリが「落ちずに起動して案内画面を出す」ことを
 * 最優先にしている。だから接続はモジュール読み込み時ではなく、実際に使う
 * 瞬間まで遅らせる（getSql）。ここが崩れると、主催者は真っ白なエラー画面を
 * 見ることになり、自力で復帰できない。
 */

import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Vercel の Neon 連携は接続文字列を複数の名前で入れる。
 * どれが入っていても動くように順に探す。
 */
const URL_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
] as const;

export function databaseUrl(): string | undefined {
  for (const key of URL_KEYS) {
    const value = process.env[key];
    if (value && value.trim() !== '') return value.trim();
  }
  return undefined;
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
