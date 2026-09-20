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
      'Vercel の画面で、このプロジェクトを開く',
      '上のメニューから「Storage」を選ぶ',
      '「Create Database」→「Neon」を選び、無料プラン（Free）のまま進む',
      '最後に「Connect」を押して、このプロジェクトにつなぐ',
    ],
    link: { label: 'Vercel の Storage を開く', href: 'https://vercel.com/dashboard/stores' },
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
      'Vercel の画面で、このプロジェクトを開く',
      '上のメニューから「Integrations」を選ぶ',
      '検索欄に Clerk と入れて、「Install」を押す',
      '無料プラン（Free）のまま進み、このプロジェクトを選ぶ',
      '追加が終わると、鍵は自動で入ります（手で貼る作業はありません）',
    ],
    link: {
      label: 'Vercel の Integrations を開く',
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
