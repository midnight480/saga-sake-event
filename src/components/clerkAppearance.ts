import type { ComponentProps } from 'react';
import type { ClerkProvider } from '@clerk/nextjs';

/**
 * Clerk が用意する標準のログイン画面を、イベントの配色に合わせる。
 * 何も指定しないとログインだけ白地の別デザインになり、会場の暗い照明の下では
 * 「別のサイトに飛ばされた」と受け取られてしまう。
 *
 * 型は ClerkProvider の props から取り出す。Clerk Core 3 で @clerk/types が
 * 廃止されたため、パッケージの内部パスを直接指さないようにしている。
 */
type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;

export const clerkAppearance: Appearance = {
  // 変数名は Clerk Core 3 のもの（colorText などの旧名は廃止されている）。
  variables: {
    colorBackground: '#16221b',
    colorPrimary: '#c0563f',
    colorPrimaryForeground: '#ffffff',
    colorForeground: '#f3efe4',
    colorMutedForeground: 'rgba(243,239,228,0.55)',
    colorMuted: '#1f3128',
    colorInput: '#1f3128',
    colorInputForeground: '#f3efe4',
    colorBorder: 'rgba(243,239,228,0.14)',
    colorNeutral: 'white',
    colorDanger: '#e08a72',
    colorSuccess: '#8fce89',
    colorWarning: '#e8a95a',
    borderRadius: '10px',
    fontFamily: "'BIZ UDPGothic', system-ui, sans-serif",
  },
  elements: {
    card: 'border border-[rgba(243,239,228,0.1)] shadow-none',
    // 入力欄は 16px 未満にしない（iOS Safari が自動でズームしてしまう）
    formFieldInput: 'text-base',
    footerActionLink: 'text-[#c8a761] hover:text-[#e0c079]',
  },
};
