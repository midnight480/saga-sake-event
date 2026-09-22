'use client';

import { useEffect, useState } from 'react';

import { iosBrowser, isIos, type IosBrowser } from '@/lib/pwa';

type Platform = IosBrowser | 'android';

/**
 * ホーム画面に追加する手順。使っているブラウザに合わせて出し分ける。
 *
 * 以前は iPhone なら Safari の手順（画面の下の「共有」）しか出していなかった。
 * Chrome では共有ボタンがアドレスバーの右にあり、手順どおりに探しても
 * 見つからない（Issue #50）。LINE などのアプリの中で開いた画面は追加そのものが
 * できないので、Safari で開き直すよう案内する。
 *
 * 端末の判定はブラウザでしかできないので、描画のあとで決める。
 */
export function AddToHomeSteps({ className = '' }: { className?: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    setPlatform(isIos() ? iosBrowser() : 'android');
  }, []);

  if (!platform) return null;

  const steps = STEPS[platform];
  return (
    <ol
      className={`flex flex-col gap-2 rounded-field bg-ink/7 p-3.5 text-[12.5px] leading-[1.8] text-ink/85 ${className}`}
    >
      {steps.map((step, i) => (
        <li key={step}>
          {steps.length > 1 ? `${i + 1}. ` : ''}
          {step}
        </li>
      ))}
    </ol>
  );
}

const STEPS: Record<Platform, string[]> = {
  safari: [
    '画面の下にある「共有」（□に↑）を押す',
    '「ホーム画面に追加」を選ぶ（無ければ下へスクロール）',
    '右上の「追加」を押す',
  ],
  chrome: [
    'アドレスバーの右にある「共有」（□に↑）を押す',
    '「ホーム画面に追加」を選ぶ（無ければ下へスクロール）',
    '右上の「追加」を押す',
  ],
  edge: [
    '画面の下の「…」を押し、「共有」を選ぶ',
    '「ホーム画面に追加」を選ぶ',
    '右上の「追加」を押す',
  ],
  firefox: [
    '画面の下の「≡」を押し、「共有」を選ぶ',
    '「ホーム画面に追加」を選ぶ',
    '右上の「追加」を押す',
  ],
  'in-app': [
    'LINE などのアプリの中で開いた画面からは、ホーム画面に追加できません。画面の右上か右下のメニューから「Safari で開く」（または「ブラウザで開く」）を選び、Safari で開き直してから追加してください。',
  ],
  android: [
    '画面の右上にある「⋮」を押す',
    '「アプリをインストール」または「ホーム画面に追加」を選ぶ',
    '「インストール」を押す',
  ],
};
