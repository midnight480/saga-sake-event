/**
 * セットアップ診断。
 *
 * 非エンジニアの主催者がひとりでデプロイを完走できるかは、ここの出来で決まる。
 * 「何が足りないか」ではなく「次にどこを押すか」を返すことを目的にしている。
 */

import { hasClerk } from './auth';
import { getSql, hasDatabase } from './db';
import { ensureSchema } from './schema';

export type CheckStatus = 'ok' | 'todo' | 'error';

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  /** 済んでいるときに見せる一言。 */
  done?: string;
  /** これからやることの手順。順番に押す場所を書く。 */
  steps?: string[];
  /** 押せば作業が始まる外部リンク。 */
  link?: { label: string; href: string };
  /** 技術的な失敗理由。開発者向けに折りたたんで出す。 */
  detail?: string;
}

export interface SetupState {
  checks: Check[];
  /** すべて ok なら true。運営を始められる。 */
  ready: boolean;
}

/**
 * このサイトの Vercel プロジェクト名。
 *
 * 「プロジェクトを開いてください」とだけ書かれても、Vercel の一覧に複数
 * 並んでいると、どれを開けばよいか分からない。名前が分かるときは案内に
 * 差し込む。ローカル開発時は分からないので、そのときは一般的な言い方に戻す。
 */
function projectName(): string | null {
  // 例: saga-sake-event.vercel.app -> saga-sake-event
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!host) return null;
  const name = host.split('.')[0];
  return name || null;
}

export async function getSetupState(): Promise<SetupState> {
  const checks: Check[] = [db(), clerk()];

  // DB がつながるなら、実際に表が作れるところまで確かめる。
  if (hasDatabase()) checks.push(await schema());
  if (hasDatabase() && hasClerk()) checks.push(await organizer());

  return { checks, ready: checks.every((c) => c.status === 'ok') };
}

function db(): Check {
  if (hasDatabase()) {
    return {
      id: 'database',
      title: 'データベース（Neon）',
      status: 'ok',
      done: '接続先が設定されています。',
    };
  }
  return {
    id: 'database',
    title: 'データベース（Neon）',
    status: 'todo',
    steps: [
      `Vercel の画面で、プロジェクト${projectName() ? `「${projectName()}」` : ''}を開く`,
      // ここは「左のサイドバー」。上を探しても無い（実際にここで詰まった）。
      '画面の左にならんでいるメニューから「Storage」を押す',
      '「Create Database」（または「Connect Database」）を押して「Neon」を選ぶ',
      '無料プラン（Free）のまま進んで作成する',
      '最後に「Connect」を押して、このプロジェクトにつなぐ',
    ],
    link: { label: 'Vercel の画面をひらく', href: 'https://vercel.com/dashboard' },
    detail: 'DATABASE_URL / POSTGRES_URL のいずれも設定されていません。',
  };
}

function clerk(): Check {
  if (hasClerk()) {
    return {
      id: 'clerk',
      title: 'ログイン（Clerk）',
      status: 'ok',
      done: '鍵が設定されています。',
    };
  }
  return {
    id: 'clerk',
    title: 'ログイン（Clerk）',
    status: 'todo',
    steps: [
      `Vercel の画面で、プロジェクト${projectName() ? `「${projectName()}」` : ''}を開く`,
      // Storage と同じく、こちらも左のサイドバーにある。
      '画面の左にならんでいるメニューから「Integrations」を押す',
      '「Browse Marketplace」から Clerk を探して「Install」を押す',
      '無料プラン（Free）のまま進み、このプロジェクトを選ぶ',
      '追加が終わると、鍵は自動で入ります（手で貼る作業はありません）',
      'そのあと Clerk の画面で「Username」を有効にする（酒蔵のログインに必要）',
    ],
    link: {
      label: 'Clerk を Vercel に追加する',
      href: 'https://vercel.com/marketplace/clerk',
    },
    detail:
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY と CLERK_SECRET_KEY の両方が必要です。',
  };
}

async function schema(): Promise<Check> {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT count(*)::int AS n FROM breweries`) as { n: number }[];
    return {
      id: 'schema',
      title: 'データの置き場所',
      status: 'ok',
      done: `準備できています（登録済みの酒蔵 ${rows[0]?.n ?? 0} 蔵）。`,
    };
  } catch (error) {
    return {
      id: 'schema',
      title: 'データの置き場所',
      status: 'error',
      steps: [
        'データベースを追加した直後は、数十秒ほど待つと直ることがあります',
        'この画面を再読み込みしてみてください',
        '何度も失敗する場合は、Vercel の Storage で Neon がこのプロジェクトに「Connected」になっているか確認してください',
      ],
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function organizer(): Promise<Check> {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT count(*)::int AS n FROM organizers`) as { n: number }[];
    if (Number(rows[0]?.n ?? 0) > 0) {
      return {
        id: 'organizer',
        title: '主催者アカウント',
        status: 'ok',
        done: '主催者が登録されています。',
      };
    }
    return {
      id: 'organizer',
      title: '主催者アカウント',
      status: 'todo',
      steps: [
        'この画面の「主催者としてはじめる」を押す',
        'ご自身のメールアドレスで登録する（届いた数字を入れるだけです）',
        '最初に登録した人が、そのまま主催者になります',
      ],
      link: { label: '主催者としてはじめる', href: '/sign-up' },
    };
  } catch (error) {
    return {
      id: 'organizer',
      title: '主催者アカウント',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
