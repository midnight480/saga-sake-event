'use client';

import { AddToHomeSteps } from '@/components/AddToHomeSteps';
import { Button, Notice } from '@/components/ui';
import { usePushSubscription } from '@/lib/usePushSubscription';

/**
 * 注文したあとのマイページに出す、通知の案内（Issue #35）。
 *
 * 設定はヘルプにもあるが、そこまで探しに行く人はいない。受け取りを待って
 * いる「いま」が、通知を入れる理由がいちばん伝わる瞬間なので、ここで聞く。
 * 断られた・使えない端末では何も出さない。しつこく出すと、画面の邪魔になる。
 */
export function ReadyNoticePrompt() {
  const { state, error, pending, turnOn } = usePushSubscription();

  if (state === 'on') {
    return (
      <p className="px-5 pt-3 text-[11.5px] leading-[1.7] text-matcha">
        できあがったら、この端末に通知でお知らせします。
      </p>
    );
  }

  if (state === 'need-install') {
    return (
      <div className="flex flex-col gap-2 px-5 pt-3">
        <Notice tone="info" title="できあがりを通知で受け取れます">
          iPhone では、ホーム画面に追加して、そのアイコンから開くと通知を受け取れます。
        </Notice>
        <AddToHomeSteps />
      </div>
    );
  }

  if (state !== 'off') return null;

  return (
    <div className="px-5 pt-3">
      <Notice tone="info" title="できあがりを通知で受け取れます">
        スマートフォンをしまっていても、蔵が準備を終えたらお知らせします。
        {error && (
          <>
            <br />
            <span className="text-terracotta-soft">{error}</span>
          </>
        )}
      </Notice>
      <div className="mt-2">
        <Button tone="gold" block onClick={turnOn} disabled={pending}>
          {pending ? '設定しています…' : '通知を受け取る'}
        </Button>
      </div>
    </div>
  );
}
