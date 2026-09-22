'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { fetchNotices, markAllNoticesRead, markNoticeRead } from '@/app/actions';
import { Button, Empty, Notice as NoticeBox } from '@/components/ui';
import { formatJstDateTime, type Notice } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 右上の 🔔。届いたお知らせを残しておき、あとから見返せるようにする。
 *
 * OS の通知は一度消すと見返せない。iPhone はホーム画面に追加しないと届きも
 * しないし、通知を許可していない人もいる。どの場合でも、アプリの中には必ず
 * 残るようにした。未読の件数は画面が 4 秒ごとに取りに来る現在値に入っている
 * ので、新しいお知らせはすぐにしるしが付く。
 */
export function NoticeBell() {
  const { snapshot, refresh } = useSnapshot();
  const unread = snapshot?.unreadNotices ?? 0;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `お知らせ（未読 ${unread} 件）` : 'お知らせ'}
        className="relative flex size-11 flex-none items-center justify-center rounded-full text-[20px] leading-none hover:bg-ink/7"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 min-w-4.5 rounded-full bg-terracotta px-1 text-center text-[10px] leading-4.5 font-bold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && <NoticePanel onClose={() => setOpen(false)} onChanged={refresh} />}
    </>
  );
}

function NoticePanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => unknown }) {
  const router = useRouter();
  const pathname = usePathname();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchNotices();
      if (result.ok) setNotices(result.value ?? []);
      else setError(result.reason);
    });
  }, []);

  const hasUnread = (notices ?? []).some((n) => !n.read);

  // 押したお知らせは既読にして、その画面へ移る。既読の印は先に付ける。
  // 通信を待ってから付けると、押したのに変わらないように見える。
  const open = (notice: Notice) => {
    setNotices((list) => list?.map((n) => (n.id === notice.id ? { ...n, read: true } : n)) ?? list);
    startTransition(async () => {
      if (!notice.read) {
        await markNoticeRead(notice.id);
        await onChanged();
      }
      onClose();
      if (notice.url && notice.url !== pathname) router.push(notice.url);
    });
  };

  const readAll = () => {
    setNotices((list) => list?.map((n) => ({ ...n, read: true })) ?? list);
    startTransition(async () => {
      const result = await markAllNoticesRead();
      if (!result.ok) setError(result.reason);
      await onChanged();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="お知らせ"
        onClick={(e) => e.stopPropagation()}
        className="rise-in flex max-h-full w-full max-w-[456px] flex-col overflow-hidden rounded-screen border border-hairline-strong bg-card shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <h2 className="font-display text-[19px] tracking-[0.04em] text-ink">お知らせ</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex size-11 items-center justify-center rounded-full text-[18px] text-ink-55 hover:bg-ink/7 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4">
              <NoticeBox tone="danger">{error}</NoticeBox>
            </div>
          )}

          {notices === null && !error && <Empty>読み込んでいます…</Empty>}

          {notices?.length === 0 && (
            <Empty>
              まだお知らせはありません。
              <br />
              開始の前後や主催者からのお知らせ、注文したお酒ができあがったときに、ここに届きます。
            </Empty>
          )}

          {notices && notices.length > 0 && (
            <ul>
              {notices.map((notice) => (
                <li key={notice.id} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => open(notice)}
                    className={`flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/5 ${
                      notice.read ? '' : 'bg-gold/6'
                    }`}
                  >
                    {/* 未読は色のついた点。色だけに頼らず、読み上げでも分かるようにする。 */}
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 flex-none rounded-full ${
                        notice.read ? 'bg-transparent' : 'bg-terracotta'
                      }`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`min-w-0 truncate text-[14px] leading-snug ${
                            notice.read ? 'text-ink-70' : 'font-bold text-ink'
                          }`}
                        >
                          <span className="sr-only">{notice.read ? '既読 ' : '未読 '}</span>
                          {/* 主催者からの配信（Issue #54）は、ほかの知らせと見分けられるように。 */}
                          {notice.kind === 'message' && (
                            <span className="mr-1.5 rounded-sm bg-gold/18 px-1.5 py-0.5 align-middle text-[10px] font-bold text-gold">
                              主催者より
                            </span>
                          )}
                          {notice.title}
                        </span>
                        <span className="flex-none font-mono text-[11px] leading-none text-ink-45">
                          {formatJstDateTime(notice.createdAt)}
                        </span>
                      </span>
                      <span className="text-[12.5px] leading-[1.7] text-ink-55">{notice.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-hairline p-3">
          <Button tone="flat" block onClick={readAll} disabled={pending || !hasUnread}>
            すべて既読にする
          </Button>
        </div>
      </div>
    </div>
  );
}
