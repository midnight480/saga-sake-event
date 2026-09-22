/**
 * セットアップ診断。
 *
 * 非エンジニアの主催者がひとりでデプロイを完走できるかは、ここの出来で決まる。
 * 「何が足りないか」ではなく「次にどこを押すか」を返すことを目的にしている。
 */

import { clerkKeyNames, hasClerk } from './auth';
import { databaseUrlKey, getSql, hasDatabase } from './db';
import { resolveDatabaseUrl } from './env';
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

  // 地域の食い違いは、遅くなるだけで運営はできる。「準備完了」を止めない。
  const where = region();
  const ready = checks.every((c) => c.status === 'ok');
  if (where) checks.push(where);

  return { checks, ready };
}

/**
 * サーバーとデータの置き場所が、同じ地域にあるか（Issue #60）。
 *
 * ★ 別の地域だと、画面の切り替えがはっきり遅くなる ★
 * サーバーはデータを取るたびに置き場所と往復する。1 画面で何度も取るので、
 * たとえばサーバーが米国東部・置き場所がシンガポールだと、1 回ごとに地球を
 * 半周する往復が重なり、1 秒以上かかっていた（実際に起きた）。
 *
 * サーバーの地域は vercel.json で sin1（シンガポール）に決めている。Vercel から
 * 作る Neon は東京・大阪を選べないので、日本からいちばん近いシンガポールに
 * そろえる。手順書でも Neon の地域に Singapore を選ぶよう案内している。
 *
 * 接続先の文字列にはパスワードが入っているので、画面には地域の名前しか出さない。
 * Vercel の外（手元の開発など）では地域が分からないので、何も出さない。
 */
const NEON_TO_VERCEL: Record<string, string> = {
  'us-east-1': 'iad1',
  'us-east-2': 'cle1',
  'us-west-2': 'pdx1',
  'eu-central-1': 'fra1',
  'eu-west-2': 'lhr1',
  'ap-southeast-1': 'sin1',
  'ap-southeast-2': 'syd1',
  'sa-east-1': 'gru1',
  'ap-northeast-1': 'hnd1',
};
const REGION_LABEL: Record<string, string> = {
  iad1: '米国東部（ワシントン）',
  cle1: '米国東部（オハイオ）',
  pdx1: '米国西部（オレゴン）',
  fra1: 'ドイツ（フランクフルト）',
  lhr1: 'イギリス（ロンドン）',
  sin1: 'シンガポール',
  syd1: 'オーストラリア（シドニー）',
  gru1: 'ブラジル（サンパウロ）',
  hnd1: '日本（東京）',
  kix1: '日本（大阪）',
};

/** 接続先の文字列から、Neon の地域（例: sin1）だけを取り出す。 */
export function databaseRegion(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // 例: ep-xxx-pooler.ap-southeast-1.aws.neon.tech
    const host = new URL(url).hostname;
    const aws = host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/)?.[1];
    return aws ? (NEON_TO_VERCEL[aws] ?? null) : null;
  } catch {
    return null;
  }
}

function region(): Check | null {
  const server = process.env.VERCEL_REGION?.trim();
  const data = databaseRegion(resolveDatabaseUrl()?.value);
  if (!server || !data) return null;

  const label = (code: string) => REGION_LABEL[code] ?? code;
  if (server === data) {
    return {
      id: 'region',
      title: 'サーバーとデータの置き場所',
      status: 'ok',
      done: `同じ地域（${label(server)}）にあります。`,
    };
  }
  return {
    id: 'region',
    title: 'サーバーとデータの置き場所',
    status: 'todo',
    steps: [
      `いまはサーバーが${label(server)}、データの置き場所が${label(data)}にあり、画面の切り替えが遅くなります（運営はできます）`,
      'まだ開催前でデータが無ければ、Neon を作り直すのがいちばん簡単です。Vercel の Storage で今の Neon を外して消し、新しく作るときに地域（Region）で「Singapore」を選んでください',
      '作り直せない場合は、開発を手伝っている人に「vercel.json の regions を、データの置き場所の地域に合わせてほしい」と伝えてください',
    ],
  };
}

function db(): Check {
  if (hasDatabase()) {
    return {
      id: 'database',
      title: 'データベース（Neon）',
      status: 'ok',
      done: '接続先が設定されています。',
      // どの名前で見つけたかを出す。Vercel の連携はプレフィックスを付けるので、
      // 「設定したのに未設定と出る」ときの切り分けがこれだけで済む。
      detail: `${databaseUrlKey()} を使っています。`,
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
    detail:
      'DATABASE_URL / POSTGRES_URL / STORAGE_POSTGRES_URL、' +
      'および末尾が _DATABASE_URL・_POSTGRES_URL の変数を探しましたが、' +
      '中身の入ったものがありませんでした。',
  };
}

function clerk(): Check {
  if (hasClerk()) {
    const names = clerkKeyNames();
    return {
      id: 'clerk',
      title: 'ログイン（Clerk）',
      status: 'ok',
      done: '鍵が設定されています。',
      detail: `${names.publishableKey} と ${names.secretKey} を使っています。`,
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
      'CLERK_SECRET_KEY / AUTHENTICATION_CLERK_SECRET_KEY、' +
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / ' +
      'NEXT_PUBLIC_AUTHENTICATION_CLERK_PUBLISHABLE_KEY、' +
      'および末尾が _CLERK_SECRET_KEY・_CLERK_PUBLISHABLE_KEY の変数を探しましたが、' +
      '両方はそろっていませんでした。',
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
