'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { NoticeBell } from '@/components/NoticeBell';
import { ConfirmDialog } from '@/components/ui';
import type { OrderingStatus } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

export interface Tab {
  href: string;
  label: string;
  icon: string;
  /** 手当てが要る件数。0 のときは出さない。 */
  badge?: number;
}

/** ログアウトしたあとの行き先と、確認の画面に添える一言。 */
export interface LogoutOptions {
  redirectUrl: string;
  note: ReactNode;
}

/**
 * どの役割でも共通の外枠。
 *
 * スマホ 1 台で完結する操作なので、幅は 480px までに抑えて中央に置く。
 * PC の大画面で開いても同じ操作ができるよう、横に広げず「大きなスマホ」として
 * 見せる。会場では主催者が PC、蔵と参加者がスマホ、という混在になる。
 */
export function AppShell({
  role,
  roleEn,
  subject,
  status,
  tabs,
  stale,
  logout,
  children,
}: {
  role: string;
  roleEn: string;
  subject?: string;
  status?: OrderingStatus;
  tabs: Tab[];
  stale?: boolean;
  logout: LogoutOptions;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="washi flex min-h-dvh justify-center bg-sumi">
      <div className="flex min-h-dvh w-full max-w-[480px] flex-col bg-surface shadow-[0_0_80px_rgba(0,0,0,0.4)]">
        {/*
          ★ ヘッダとメニューは上に固定する（Issue #36）★
          以前はメニューを画面の下に置いていたが、外枠が「最低でも画面の高さ」
          （min-h-dvh）なので、中身が増えるとページごと伸び、メニューは中身の
          いちばん最後に押し出されていた。蔵が増えたり注文が積み上がったりすると、
          メニューに届くまで長くスクロールすることになる。
          上に置いて sticky で留めれば、中身がいくら増えても常に手の届く位置にある。
        */}
        <div className="sticky top-0 z-30 bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
            {/*
              蔵名や参加者番号は、役割名の下の 2 行目に置く。右上に 🔔 と更新ボタンを
              置いたぶん幅が減り、横に並べると iPhone 15 Pro でも蔵名が「…」で切れた。
              2 行目なら、幅 375px 以上ではどの組み合わせでも全部見える（Issue #49）。
              どの蔵の画面かを確かめる表示なので、蔵名を優先する。
            */}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-display text-[17px] leading-none tracking-[0.08em] text-ink">
                {role}
              </span>
              <span className="truncate text-[11px] leading-none tracking-[0.06em] text-ink-45">
                {subject ?? roleEn}
              </span>
            </div>
            <div className="flex flex-none items-center gap-1">
              {status && <StatusChip status={status} />}
              {/* 画面の更新。🔔 の左に置く（Issue #49）。 */}
              <RefreshButton />
              {/* お知らせの履歴。右上に置き、未読の数を出す。 */}
              <NoticeBell />
            </div>
          </header>

          <nav aria-label="画面の切り替え" className="flex border-b border-hairline bg-surface py-1">
            {tabs.map((tab) => {
              // 完全一致か、配下のページを開いているときに点灯させる。
              const active =
                pathname === tab.href ||
                (tab.href !== '/organizer' &&
                  tab.href !== '/brewery' &&
                  tab.href !== '/guest' &&
                  pathname.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  // min-w-0 が要る。無いと flex の子は中身より縮まず、長い名前の
                  // タブがあるとメニューごと右にはみ出す（truncate が効かない）。
                  className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 ${
                    active ? 'text-gold-bright' : 'text-ink-45'
                  }`}
                >
                  <span aria-hidden className="relative text-[17px] leading-none">
                    {tab.icon}
                    {!!tab.badge && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-terracotta px-1 text-[9px] leading-4 font-bold text-white">
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate px-0.5 text-[10.5px] leading-none">
                    {tab.label}
                  </span>
                </Link>
              );
            })}
            <LogoutTab {...logout} />
          </nav>

          {/* 通信が不安定なことは、どこまでスクロールしても見えている必要がある。 */}
          {stale && (
            <div className="bg-amber/12 px-5 py-2 text-center text-[11.5px] leading-snug text-amber">
              通信が不安定です。表示は少し前の状態かもしれません。
            </div>
          )}
        </div>

        {/* 画面下端の丸みやホームバーに、最後の行が隠れないようにする。 */}
        <main className="flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</main>
      </div>
    </div>
  );
}

/**
 * 画面の更新（Issue #49）。
 *
 * 数字は 4 秒ごとに自動で新しくなるが、電波の悪い会場では「いま最新なのか」が
 * 分からず不安になる。押せばその場で取り直し、画面の組み立てもやり直す。
 * ブラウザの再読み込みと違って、入力途中の内容やスクロール位置は消えない。
 * 取り直している間は矢印を回し、押したことが分かるようにする。
 */
function RefreshButton() {
  const router = useRouter();
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      // 速い回線では一瞬で終わり、押したのか分からない。最低でも半秒は回す。
      await Promise.all([refresh(), new Promise((r) => setTimeout(r, 500))]);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      aria-label={pending ? '更新しています' : '画面を更新'}
      className="flex size-11 flex-none items-center justify-center rounded-full text-[20px] leading-none text-ink-70 hover:bg-ink/7 hover:text-ink disabled:opacity-70"
    >
      <span aria-hidden className={pending ? 'inline-block animate-spin' : 'inline-block'}>
        ↻
      </span>
    </button>
  );
}

/**
 * ログアウト。メニューのいちばん右に置く（Issue #31）。
 *
 * 押し間違えると入り直しに手間がかかる（蔵は蔵ID とパスワードが要る）ので、
 * 必ず確認を挟む。画面を切り替えるタブと見た目はそろえるが、中身はボタン。
 */
function LogoutTab({ redirectUrl, note }: LogoutOptions) {
  const { signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await signOut({ redirectUrl });
    } catch {
      // 通信が切れていた、など。画面に留めて、もう一度押せるようにする。
      setPending(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-ink-45 hover:text-ink"
      >
        <span aria-hidden className="text-[17px] leading-none">
          ↩
        </span>
        <span className="max-w-full truncate px-0.5 text-[10.5px] leading-none">ログアウト</span>
      </button>

      <ConfirmDialog
        open={confirming}
        title="ログアウトしますか"
        confirmLabel="はい、ログアウトします"
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        pending={pending}
      >
        {note}
      </ConfirmDialog>
    </>
  );
}

/**
 * いま受付をしているかどうかの表示。
 * 予定どおりか、主催者が手で決めたのかが分かるようにしている。
 */
function StatusChip({ status }: { status: OrderingStatus }) {
  const dot = status.open ? 'bg-matcha' : status.manual ? 'bg-terracotta' : 'bg-gold';
  return (
    <span className="flex flex-none items-center gap-2 rounded-full border border-hairline-strong bg-card px-3 py-1.5">
      <span className={`size-[7px] rounded-full ${dot} ${status.open ? 'pulse-dot' : ''}`} />
      <span className="text-[11.5px] font-bold leading-none whitespace-nowrap text-ink">
        {status.label}
      </span>
    </span>
  );
}
