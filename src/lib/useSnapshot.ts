'use client';

import useSWR from 'swr';

import type { Snapshot } from './store';

const REFRESH_MS = 4000;

async function fetchSnapshot(url: string): Promise<Snapshot> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/**
 * 会場の現在値を購読する。
 *
 * 4 秒ごとに取り直す。会場では電波が不安定なので、
 * - 失敗しても前回の値を表示し続ける（画面が空にならない）
 * - 画面に戻ってきた瞬間に取り直す（ポケットから出したら最新になる）
 * の 2 点を守っている。
 */
export function useSnapshot() {
  const { data, error, isLoading, mutate } = useSWR('/api/snapshot', fetchSnapshot, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
    // 一時的な失敗で画面を壊さない。次の巡回で自然に復帰する。
    shouldRetryOnError: true,
    errorRetryInterval: REFRESH_MS,
  });

  return {
    snapshot: data,
    /** 一度も取れていないときだけ true。再取得中は false。 */
    isInitialLoading: isLoading && !data,
    /** 通信が切れているか（値は前回のものを出している）。 */
    isStale: !!error && !!data,
    error,
    refresh: mutate,
  };
}
