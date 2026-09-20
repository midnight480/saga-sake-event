/**
 * スキーマを DB に適用する処理。SQL そのものは schema-sql.ts にある。
 */

import { getSql, hasDatabase } from './db';
import {
  SCHEMA_LOCK_ID,
  SCHEMA_VERSION,
  SEED_STATEMENTS,
  STATEMENTS,
} from './schema-sql';

export { SCHEMA_VERSION };

/**
 * このプロセスで一度だけスキーマを流す。
 */
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!hasDatabase()) {
    return Promise.reject(new Error('DATABASE_URL が設定されていません'));
  }
  if (!schemaReady) {
    schemaReady = applySchema().catch((error) => {
      // 失敗を覚えたままにすると次のリクエストで永久に直らないため、
      // キャッシュを捨てて次回やり直せるようにする。
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/**
 * すべての文を 1 つのトランザクションで流す。
 *
 * ★ ここは Neon の HTTP ドライバの性質に合わせてある ★
 * このドライバは 1 文ごとに接続を開いて閉じるので、セッションに紐づく
 * pg_advisory_lock は取った直後に解放されてしまい、排他の役に立たない。
 * トランザクション内でだけ効く pg_advisory_xact_lock を、同じ
 * トランザクションの先頭に置くことで、複数インスタンスが同時に起動しても
 * スキーマ作成が 1 本だけ通るようにしている。
 *
 * 途中で失敗すれば全部巻き戻るので、「表が半分だけある」状態にもならない。
 */
async function applySchema(): Promise<void> {
  const sql = getSql();

  await sql.transaction((txn) => [
    // 4200000001 は「このアプリのスキーマ適用」を表す任意の固定値。
    txn.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_ID]),
    ...[...STATEMENTS, ...SEED_STATEMENTS].map((statement) => txn.query(statement)),
    txn.query(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(SCHEMA_VERSION)],
    ),
  ]);
}
