/**
 * サーバーが立ち上がるときに、いちばん最初に走る場所。
 * 環境変数の名前ゆれをここでそろえておく（詳細は src/lib/env.ts）。
 */
export async function register(): Promise<void> {
  await import('./lib/env-init');
}
