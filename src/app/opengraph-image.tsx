import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

/**
 * SNS やチャットに URL を貼ったときに出る画像。
 *
 * 当日の案内は LINE やメールで回ることが多い。そこに「佐嘉 蔵めぐり」と
 * 出るだけで、何のリンクか分かって開いてもらいやすくなる。
 *
 * 画像は毎回その場で組み立てる。日本語を描くので書体が要るが、丸ごと置くと
 * 4 MB 近くになるため、ここで使う文字だけを切り出したものを同梱している
 * （src/assets/kaisei-subset.ttf）。外から取りに行かないので、回線が細くても
 * 生成に失敗しない。
 */
export const alt = '佐嘉 蔵めぐり ─ 合同試飲イベント運営';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SUMI = '#101a14';
const INK = '#f3efe4';
const GOLD = '#c8a761';

export default async function OpengraphImage() {
  const font = await readFile(
    path.join(process.cwd(), 'src/assets/kaisei-subset.ttf'),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: SUMI,
          padding: '0 96px',
          // 画面と同じ縦罫。並べたときに同じものだと分かる。
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(243,239,228,.022) 0 1px, transparent 1px 58px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 10,
            color: GOLD,
            marginBottom: 28,
          }}
        >
          SAGA SAKE FESTIVAL
        </div>

        <div style={{ display: 'flex', fontSize: 132, color: INK, letterSpacing: 8 }}>
          佐嘉 蔵めぐり
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 34,
            color: 'rgba(243,239,228,0.6)',
            marginTop: 36,
          }}
        >
          合同試飲イベントの 受付・在庫・チケットを ひとつに
        </div>

        <div
          style={{
            display: 'flex',
            width: 132,
            height: 5,
            background: GOLD,
            marginTop: 56,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Kaisei', data: font, weight: 400, style: 'normal' }],
    },
  );
}
