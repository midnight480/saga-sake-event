import type { MetadataRoute } from 'next';

/**
 * ホーム画面に追加したときの設定。
 * 主催者・蔵の担当者は当日ずっと同じ画面を開くので、ブラウザの UI を隠して
 * アプリのように使えるようにしておく。iPhone と Android の両方で効く。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '佐嘉 蔵めぐり',
    short_name: '蔵めぐり',
    description: '佐賀の酒蔵が集まる合同試飲イベントの運営アプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#101a14',
    theme_color: '#101a14',
    lang: 'ja',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
