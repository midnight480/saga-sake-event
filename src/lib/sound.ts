'use client';

/**
 * 音と振動。蔵への新着（#51）、参加者へのできあがり（#58）、券の読み取りの
 * 成功・失敗（#57）で使う。
 *
 * 音源のファイルは持たず、Web Audio でその場で鳴らす。読み込みに失敗して
 * 鳴らない、を避けるため。
 *
 * ★ ブラウザは、人が画面に触れる前に音を鳴らさせてくれない ★
 * 押したボタンの処理の中で unlockSound() を呼べば、その場で鳴る状態になり、
 * 同じ画面にいる間は（ページを移っても）鳴り続けられる。開き直したあとは、
 * どこか一度触れた時点で鳴る状態に戻す（呼ぶ側で pointerdown を拾う）。
 * iPhone は本体の消音スイッチが入っていると鳴らない（ブラウザからは変えられない）。
 */

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  return audio;
}

/** 音を鳴らせる状態か。触れる前は false。 */
export function soundReady(): boolean {
  return audio?.state === 'running';
}

/** 人が画面に触れたときに呼ぶ。ここで初めて音を鳴らせる状態になる。 */
export async function unlockSound(): Promise<boolean> {
  const ctx = context();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/** 音を 1 つ鳴らす。いきなり鳴らすとプツッと雑音が入るので、音量を滑らかに上げ下げする。 */
function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  length: number,
  type: OscillatorType = 'sine',
  volume = 0.6,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

function running(): AudioContext | null {
  const ctx = context();
  return ctx && ctx.state === 'running' ? ctx : null;
}

/**
 * 「ピッ・ポーン」。知らせの音（蔵への新着、参加者へのできあがり）。
 * 会場はにぎやかなので、高めの音を 2 つ続けて耳に残るようにする。
 */
export function playChime(): void {
  const ctx = running();
  if (!ctx) return;
  tone(ctx, 988, 0, 0.18); // シ
  tone(ctx, 1319, 0.2, 0.32); // ミ
}

/** 上がっていく明るい和音。うまくいったときの音（券の読み取りの成功）。 */
export function playSuccess(): void {
  const ctx = running();
  if (!ctx) return;
  tone(ctx, 1047, 0, 0.12); // ド
  tone(ctx, 1319, 0.1, 0.12); // ミ
  tone(ctx, 1568, 0.2, 0.12); // ソ
  tone(ctx, 2093, 0.3, 0.36); // 高いド
}

/** 低く下がる 2 音。うまくいかなかったときの音。成功の音と聞き間違えないよう、音色も変える。 */
export function playError(): void {
  const ctx = running();
  if (!ctx) return;
  tone(ctx, 330, 0, 0.18, 'square', 0.25);
  tone(ctx, 247, 0.2, 0.3, 'square', 0.25);
}

// ─────────────────────────────────────────────────────────────
// 振動（Android のみ。iPhone のブラウザは振動に対応していない）
// ─────────────────────────────────────────────────────────────

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** 知らせの振動（ブブッ・ブブッ）。 */
export function vibrate(pattern: number[] = [220, 120, 220]): void {
  if (canVibrate()) navigator.vibrate(pattern);
}

/** 成功は短く 1 回、失敗は小刻みに 3 回。見なくても区別できるように。 */
export const VIBRATE_SUCCESS = [120];
export const VIBRATE_ERROR = [80, 60, 80, 60, 80];
