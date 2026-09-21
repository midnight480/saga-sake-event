/**
 * 画面の部品。
 *
 * デザインの見た目はここに閉じ込める。各ページは部品を並べるだけにして、
 * 色や余白を直書きしない。色は globals.css の @theme で定義したトークンを
 * Tailwind のクラス（bg-card, text-gold など）として参照する。
 *
 * スマホの実機で確実に押せるよう、触る部品はすべて高さ 44px 以上にしている。
 */

import type { ComponentProps, ReactNode } from 'react';

import { STATUS_LABEL, type RequestStatus } from '@/lib/domain';

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────
// 文字
// ─────────────────────────────────────────────────────────────

/** 「STEP 1」「LIVE」のような、字間を広くとった小さい金色のラベル。 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[10px] leading-none tracking-[0.3em] text-gold">{children}</div>
  );
}

/** 画面の見出し。明朝体。 */
export function Title({ children, size = 'md' }: { children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <h1
      className={cx(
        'font-display tracking-[0.05em] text-ink',
        size === 'lg' ? 'text-[27px]' : 'text-[23px]',
      )}
    >
      {children}
    </h1>
  );
}

/** 本文の補足。読みやすさのため行間を広くとる。 */
export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' }) {
  return (
    <p
      className={cx(
        'text-[12.5px] leading-[1.8]',
        tone === 'gold' ? 'text-gold-bright' : 'text-ink-55',
      )}
    >
      {children}
    </p>
  );
}

/** 一覧の区切りに置く小見出し。 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 pt-5 pb-2 text-[11px] leading-none tracking-[0.2em] text-ink-45">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 入れ物
// ─────────────────────────────────────────────────────────────

/** 画面上部。見出しと説明を載せる帯。 */
export function ScreenHeader({ children }: { children: ReactNode }) {
  return <header className="border-b border-hairline px-5 pt-5 pb-4">{children}</header>;
}

export function Card({
  children,
  className,
  animate = false,
}: {
  children: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-card border border-hairline bg-card p-4',
        animate && 'rise-in',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 入力を促す、破線で囲った枠（銘柄の追加・蔵の追加）。 */
export function AddBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-gold/40 p-4">
      <div className="text-[12px] font-bold leading-none tracking-[0.1em] text-gold">{title}</div>
      {children}
    </div>
  );
}

/** 何も無いときの案内。空白のまま放置しない。 */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center text-[12.5px] leading-[1.9] text-ink-45">{children}</div>
  );
}

/** 注意・警告・エラーの帯。 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const skin = {
    info: 'border-gold/40 bg-gold/10 text-gold-bright',
    warn: 'border-amber/55 bg-amber/12 text-amber',
    danger: 'border-terracotta/50 bg-terracotta/12 text-terracotta-soft',
  }[tone];

  return (
    <div className={cx('flex flex-col gap-2 rounded-card border p-4', skin)}>
      {title && <div className="text-[12px] font-bold leading-none tracking-[0.08em]">{title}</div>}
      <div className="text-[12.5px] leading-[1.8] text-ink/85">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ボタン
// ─────────────────────────────────────────────────────────────

type ButtonTone = 'go' | 'ok' | 'flat' | 'ghost' | 'danger' | 'gold';

const BUTTON_SKIN: Record<ButtonTone, string> = {
  go: 'bg-terracotta text-white border-terracotta hover:bg-terracotta-hover',
  ok: 'bg-matcha/16 text-matcha border-matcha/45 hover:bg-matcha/25',
  flat: 'bg-transparent text-ink-55 border-hairline-strong hover:bg-ink/8 hover:text-ink',
  ghost: 'bg-transparent text-ink border-hairline-strong hover:bg-ink/8',
  danger: 'bg-terracotta text-white border-terracotta hover:bg-terracotta-hover',
  gold: 'bg-gold/10 text-gold border-gold/45 hover:bg-gold/20',
};

export function Button({
  tone = 'ghost',
  block = false,
  className,
  children,
  ...rest
}: {
  tone?: ButtonTone;
  block?: boolean;
} & ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      className={cx(
        // min-h-12 = 48px。指で確実に押せる高さを全ボタンで担保する。
        'inline-flex min-h-12 items-center justify-center rounded-[9px] border px-4',
        'text-[13px] font-bold leading-none transition-colors',
        'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-ink/10 disabled:text-ink-45',
        block && 'w-full',
        BUTTON_SKIN[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 選択肢の丸ボタン（チップ）。選ばれているものは金色で示す。 */
export function Chip({
  active,
  className,
  children,
  ...rest
}: { active?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-11 items-center justify-center rounded-full border px-3',
        'text-[12px] leading-none transition-colors',
        active
          ? 'border-gold/70 bg-gold/16 text-gold-bright'
          : 'border-hairline-strong bg-transparent text-ink-55 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** ラジオボタン風の選択肢。種類・所在地のように数が多いものに使う。 */
export function RadioCard({
  active,
  label,
  ...rest
}: { active: boolean; label: string } & ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      role="radio"
      aria-checked={active}
      className={cx(
        'flex min-h-12 items-center gap-2 rounded-field border px-3 text-left text-[14px] leading-tight transition-colors',
        active
          ? 'border-gold/70 bg-gold/14 text-ink'
          : 'border-hairline-strong bg-card text-ink-70 hover:text-ink',
      )}
    >
      <span
        className={cx(
          'flex size-5 flex-none items-center justify-center rounded-full border-2',
          active ? 'border-gold' : 'border-ink/30',
        )}
      >
        {active && <span className="size-2.5 rounded-full bg-gold" />}
      </span>
      {label}
    </button>
  );
}

/** − 数字 ＋ の increment/decrement。本数・杯数で使う。 */
export function Stepper({
  value,
  unit,
  onDecrease,
  onIncrease,
  decreaseDisabled,
  increaseDisabled,
  label,
}: {
  value: number | string;
  unit: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onDecrease}
        disabled={decreaseDisabled}
        aria-label={`${label}を1つ減らす`}
        className="size-12 flex-none rounded-[9px] border border-hairline-strong text-xl text-ink transition-colors hover:bg-ink/8 disabled:text-ink-45"
      >
        −
      </button>
      <div className="flex flex-1 items-baseline justify-center gap-1">
        <span className="font-display text-[26px] text-ink">{value}</span>
        <span className="text-xs text-ink-55">{unit}</span>
      </div>
      <button
        type="button"
        onClick={onIncrease}
        disabled={increaseDisabled}
        aria-label={`${label}を1つ増やす`}
        className="size-12 flex-none rounded-[9px] border border-hairline-strong text-xl text-ink transition-colors hover:bg-ink/8 disabled:text-ink-45"
      >
        ＋
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 入力
// ─────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11.5px] leading-none tracking-[0.08em] text-ink-55">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-[1.6] text-ink-45">{hint}</span>}
    </label>
  );
}

/** すべての入力欄で共通の見た目。font-size は 16px 固定（iOS の自動ズーム防止）。 */
export const inputClass =
  'w-full rounded-field border border-hairline-strong bg-card px-3.5 py-3.5 text-base text-ink ' +
  'placeholder:text-ink-45 focus:border-gold/70 focus:outline-none';

// ─────────────────────────────────────────────────────────────
// 数字・バー・バッジ
// ─────────────────────────────────────────────────────────────

/** 残量バー。残りが少ないほど赤に寄る。 */
export function StockBar({ percent, thin = false }: { percent: number; thin?: boolean }) {
  const color = percent < 20 ? 'bg-terracotta' : percent < 50 ? 'bg-amber' : 'bg-matcha';
  return (
    <div
      className={cx('overflow-hidden rounded-sm bg-ink/10', thin ? 'h-1' : 'h-1.5')}
      role="img"
      aria-label={`残り ${percent}%`}
    >
      <div className={cx('h-full rounded-sm', color)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** ダッシュボードの数値タイル。 */
export function Kpi({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface p-4">
      <span className="text-[11px] leading-none text-ink-55">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-[27px] text-ink">{value}</span>
        <span className="text-[11px] text-ink-45">{unit}</span>
      </div>
    </div>
  );
}

const STATUS_SKIN: Record<RequestStatus, string> = {
  accepted: 'bg-gold/16 text-gold-bright',
  preparing: 'bg-amber/16 text-amber',
  ready: 'bg-matcha/18 text-matcha',
  delivered: 'bg-ink/8 text-ink-55',
  cancelled: 'bg-ink/8 text-ink-45',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={cx(
        'max-w-24 flex-none rounded-[7px] px-2 py-1.5 text-center text-[10.5px] font-bold leading-snug',
        STATUS_SKIN[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** 混雑の表示。 */
export function CrowdBadge({ level, closed }: { level: string; closed?: boolean }) {
  const skin = closed
    ? 'bg-ink/10 text-ink-55'
    : level === '混雑'
      ? 'bg-terracotta/20 text-terracotta-soft'
      : level === 'やや混雑'
        ? 'bg-amber/16 text-amber'
        : 'bg-matcha/16 text-matcha';
  return (
    <span
      className={cx('flex-none rounded-full px-2.5 py-1.5 text-[10.5px] font-bold leading-none', skin)}
    >
      {closed ? '受付停止中' : level}
    </span>
  );
}

/** 残り杯数 / 完売 の表示。 */
export function LeftBadge({ left }: { left: number }) {
  return (
    <span
      className={cx(
        'flex-none rounded-full px-2.5 py-1.5 text-[11px] font-bold leading-none',
        left > 0 ? 'bg-matcha/14 text-matcha' : 'bg-terracotta/18 text-terracotta-soft',
      )}
    >
      {left > 0 ? `残り ${left} 杯` : '完売'}
    </span>
  );
}

/**
 * 取り返しのつきにくい操作の前に挟む確認ダイアログ。
 *
 * 押し間違いを防ぐのが目的なので、既定の重みは「やめる」側に置いている。
 * 画面の外側を押すか Esc でも取り消せる。
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'いいえ',
  onConfirm,
  onCancel,
  pending,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:items-center"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 中身を押したときに、外側の取り消しへ伝わらないようにする。
        onClick={(e) => e.stopPropagation()}
        className="rise-in flex w-full max-w-[420px] flex-col gap-4 rounded-screen border border-hairline-strong bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <h2 className="font-display text-[20px] tracking-[0.04em] text-ink">{title}</h2>
        <div className="text-[12.5px] leading-[1.9] text-ink-70">{children}</div>

        <div className="mt-1 flex flex-col gap-2">
          {/* 「はい」は通常の見た目。押し間違いを誘わないよう強調しない。 */}
          <Button tone="ghost" block onClick={onConfirm} disabled={pending}>
            {pending ? '処理しています…' : confirmLabel}
          </Button>
          {/* 「いいえ」を赤く目立たせて、迷ったらこちらを選べるようにする。 */}
          <Button tone="danger" block onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
