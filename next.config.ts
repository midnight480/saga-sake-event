import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 主催者が GitHub 上でファイルを直接編集してもデプロイが止まらないように、
  // 型エラーでビルドを落とさない。誤字ひとつで当日デプロイできなくなる方が
  // 危険なため。型は CI の npm run typecheck で必ず検査する。
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
