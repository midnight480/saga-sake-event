/**
 * 読み込まれた瞬間に環境変数の名前ゆれをそろえる、副作用だけのモジュール。
 *
 * ★ なぜ関数呼び出しではなく import なのか ★
 * Clerk のライブラリは読み込まれた時点で process.env を見にいく。あとから
 * normalizeEnv() を呼んでも間に合わない。ES モジュールは import 文の順番に
 * 評価されるので、Clerk より先にこれを import すれば確実に先回りできる。
 *
 * 使うときは、必ず @clerk/* の import より前に置くこと。
 */
import { normalizeEnv } from './env';

normalizeEnv();
