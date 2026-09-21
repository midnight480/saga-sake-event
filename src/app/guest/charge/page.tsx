'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { redeemTicket } from '@/app/actions';
import {
  Button,
  Card,
  Empty,
  Notice,
  ScreenHeader,
  Title,
  inputClass,
} from '@/components/ui';
import { useSnapshot } from '@/lib/useSnapshot';

/** 読み取り履歴（この端末で今回開いている間だけ覚える）。 */
interface LogEntry {
  time: string;
  code: string;
  cups: number;
}

export default function ChargePage() {
  return (
    <Suspense fallback={<Empty>読み込んでいます…</Empty>}>
      <Charge />
    </Suspense>
  );
}

function Charge() {
  const searchParams = useSearchParams();
  const { snapshot, refresh } = useSnapshot();

  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [pending, startTransition] = useTransition();

  // 同じコードを連続で送らないための記録。カメラは 1 秒に何度も同じ QR を読む。
  const submitted = useRef<Set<string>>(new Set());

  const submit = useCallback(
    (raw: string) => {
      // 券の QR には /guest/charge?code=… が入っている（Issue #33）。
      // URL だったら中の code だけを取り出す。code の無い URL（以前の共通 QR の
      // 貼り紙が残っていた、など）は、券コードとして送ると「登録されていません」と
      // 出て驚かせるので何もしない。
      let code = raw;
      if (/^https?:\/\//i.test(raw.trim())) {
        try {
          const fromUrl = new URL(raw.trim()).searchParams.get('code');
          if (!fromUrl) return;
          code = fromUrl;
        } catch {
          return;
        }
      }

      const normalized = code.trim().toUpperCase();
      if (!normalized || submitted.current.has(normalized) || pending) return;
      submitted.current.add(normalized);

      setError(null);
      setSuccess(null);
      startTransition(async () => {
        const result = await redeemTicket(normalized);
        if (result.ok && result.value) {
          setSuccess(`${result.value.label} を読み取りました。＋${result.value.added} ポイント`);
          setLog((prev) => [
            {
              time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
              code: normalized,
              cups: result.value!.added,
            },
            ...prev,
          ]);
          setManualCode('');
        } else if (!result.ok) {
          setError(result.reason);
          // 失敗したコードは、直してもう一度試せるように記録から外す。
          submitted.current.delete(normalized);
        }
        await refresh();
      });
    },
    [pending, refresh],
  );

  // 端末標準のカメラアプリで QR を読むと、この URL に ?code= 付きで来る。
  const codeFromUrl = searchParams.get('code');
  useEffect(() => {
    if (codeFromUrl) submit(codeFromUrl);
  }, [codeFromUrl, submit]);

  const guest = snapshot?.guest;

  return (
    <>
      <ScreenHeader>
        <Title>ポイントを追加</Title>
        <p className="mt-2 text-[12px] leading-[1.7] text-ink-55">
          お手持ちの券に書かれたコードを入れてください。前売券・当日券のどちらも、同じ残高に入ります。
          一度使ったコードは、二度は使えません。
        </p>
        {guest && (
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-display text-[26px] text-gold">{guest.tickets}</span>
            <span className="text-[12px] text-ink-55">ポイント（現在の残高）</span>
          </div>
        )}
      </ScreenHeader>

      <div className="flex flex-col gap-4 px-5 py-4">
        {success && <Notice tone="info">{success}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}

        <Card>
          <label className="flex flex-col gap-2">
            <span className="text-[11.5px] leading-none tracking-[0.08em] text-ink-55">
              券に書かれたコード
            </span>
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="SAGA-DAY-XXXXXXXXXX"
              className={`${inputClass} font-mono text-[17px] tracking-wider`}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
            />
          </label>
          <Button
            tone="go"
            block
            onClick={() => submit(manualCode)}
            disabled={pending || !manualCode.trim()}
          >
            {pending ? '確認しています…' : 'ポイントを受け取る'}
          </Button>
        </Card>

        <details className="rounded-card border border-hairline bg-card p-4">
          <summary className="cursor-pointer text-[12.5px] text-ink-55">
            券に QR が付いている場合は、カメラで読み取れます
          </summary>
          <div className="mt-3">
            <Scanner onDetect={submit} disabled={pending} />
          </div>
        </details>

        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] leading-none tracking-[0.2em] text-ink-45">読み取り履歴</div>
          {log.length === 0 ? (
            <p className="text-[12px] leading-[1.8] text-ink-45">まだ読み取っていません。</p>
          ) : (
            log.map((entry) => (
              <div
                key={entry.code}
                className="rise-in flex justify-between gap-3 rounded-field border border-hairline bg-card px-3.5 py-3 text-[12.5px] leading-none"
              >
                <span className="min-w-0 truncate text-ink-55">
                  {entry.time} ・ {entry.code}
                </span>
                <span className="flex-none font-bold text-matcha">＋{entry.cups} ポイント</span>
              </div>
            ))
          )}
          <p className="mt-1 text-[11.5px] leading-[1.8] text-ink-55">
            券面のQRを読み取るだけで加算されます。係員の端末操作は不要です。
            一度読み取った券は使えなくなります。
          </p>
        </div>
      </div>
    </>
  );
}

type ScannerState = 'idle' | 'starting' | 'running' | 'denied' | 'unsupported';

/**
 * QR の読み取り。
 *
 * iPhone（Safari）と Android（Chrome）の両方で動かすのが最優先。ブラウザ内蔵の
 * BarcodeDetector は Safari に無いため使わず、どちらでも同じように動く ZXing に
 * 一本化している。分岐を増やすより、当日 1 つの道が確実に動くことを選んだ。
 *
 * カメラは必ずボタンを押してから起動する。開いた瞬間に許可を求めると、
 * 意図が分からないまま拒否されて二度と出せなくなる。
 */
function Scanner({ onDetect, disabled }: { onDetect: (code: string) => void; disabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<ScannerState>('idle');

  // 画面を離れるときは必ずカメラを止める。止め忘れると端末が熱を持ち、
  // ほかのアプリからカメラが使えなくなる。
  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    setState('starting');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 200,
        delayBetweenScanSuccess: 1200,
      });

      const controls = await reader.decodeFromConstraints(
        // 背面カメラを優先する。前面だと券を自分に向けることになり読めない。
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (result) onDetect(result.getText());
        },
      );

      stopRef.current = () => controls.stop();
      setState('running');
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      // 許可の拒否と、カメラが無い/使えないを区別して案内を変える。
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported');
    }
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setState('idle');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-screen bg-well">
        <video
          ref={videoRef}
          // iOS Safari は playsInline が無いと全画面再生に切り替わってしまう。
          playsInline
          muted
          className={`size-full object-cover ${state === 'running' ? '' : 'hidden'}`}
        />

        {state !== 'running' && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg,rgba(243,239,228,.04) 0 6px,transparent 6px 12px)',
            }}
          />
        )}

        {/* 四隅の枠。券をどこに合わせるかを示す。 */}
        {['top-5.5 left-5.5 border-t-[3px] border-l-[3px] rounded-tl-md',
          'top-5.5 right-5.5 border-t-[3px] border-r-[3px] rounded-tr-md',
          'bottom-5.5 left-5.5 border-b-[3px] border-l-[3px] rounded-bl-md',
          'bottom-5.5 right-5.5 border-b-[3px] border-r-[3px] rounded-br-md',
        ].map((position) => (
          <div key={position} aria-hidden className={`absolute size-8 border-gold ${position}`} />
        ))}

        {state !== 'running' && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[12px] leading-[1.9] text-ink-55">
            {state === 'idle' && (
              <span>
                お手持ちの券の
                <br />
                QRコード を読み取ります
              </span>
            )}
            {state === 'starting' && <span>カメラを起動しています…</span>}
            {state === 'denied' && (
              <span>
                カメラの使用が許可されていません。
                <br />
                ブラウザの設定で許可するか、
                <br />
                上の欄にコードを入力してください。
              </span>
            )}
            {state === 'unsupported' && (
              <span>
                この端末ではカメラを使えませんでした。
                <br />
                上の欄にコードを入力してください。
              </span>
            )}
          </div>
        )}
      </div>

      {state === 'running' ? (
        <Button tone="flat" block onClick={stop}>
          カメラを止める
        </Button>
      ) : (
        <Button tone="go" block onClick={start} disabled={disabled || state === 'starting'}>
          {state === 'starting' ? '起動しています…' : 'カメラでQRを読み取る'}
        </Button>
      )}
    </div>
  );
}
