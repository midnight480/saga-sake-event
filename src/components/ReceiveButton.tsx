'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { confirmReceived } from '@/app/actions';
import { Button, ConfirmDialog, Notice } from '@/components/ui';
import type { OrderRequest } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/**
 * 参加者が自分で「受け取りました」を押す（Issue #72）。
 *
 * 蔵が「受渡完了」を押すだけだと、参加者から見ると「何もしていないのに受け取り完了に
 * なった」になり、蔵が別の人の注文を押し間違えても誰も気づけなかった。ブースで蔵の人に
 * この画面を見せて、その場で押してもらう。
 *
 * 押すと取り消せない（受渡完了になり、次のリクエストを出せるようになる）ので、確認を挟む。
 * 受け取る前に押してしまうと、お酒を受け取れないまま完了になるため。
 * 受け取ったあとは DeliveredAlert が記録の画面へ案内する。
 */
export function ReceiveButton({
  request,
  breweryName,
  className,
}: {
  request: OrderRequest;
  breweryName?: string;
  className?: string;
}) {
  const { refresh } = useSnapshot();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (request.status !== 'ready') return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmReceived(request.id);
      setConfirming(false);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <Button tone="go" block onClick={() => setConfirming(true)} disabled={pending}>
        {pending ? '記録しています…' : '受け取りました'}
      </Button>
      {error && <Notice tone="danger">{error}</Notice>}

      {/*
        確認は body の直下に出す。できあがりの帯（ReadyAlert）の中に置くと、帯の
        動き（transform）が画面に固定する位置の基準になり、帯の中に押し込められる。
      */}
      {confirming &&
        createPortal(
          <ConfirmDialog
            open
            title="お酒を受け取りましたか"
            confirmLabel="はい、受け取りました"
            onConfirm={confirm}
            onCancel={() => setConfirming(false)}
            pending={pending}
          >
            {breweryName ? `${breweryName}の` : ''}
            <strong className="text-ink">「{request.brand}」{request.cups} 杯</strong>
            を受け取ったら押してください。蔵の人に画面を見せながら押すと確実です。
            <br />
            <br />
            押すと受け取り済みになり、取り消せません。次のリクエストを出せるようになります。
          </ConfirmDialog>,
          document.body,
        )}
    </div>
  );
}
