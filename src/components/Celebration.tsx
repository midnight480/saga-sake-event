'use client';

import { useMemo } from 'react';

/**
 * 画面の左右の下から、クラッカーのように紙ふぶきが飛び出す（Issue #57）。
 *
 * 券を読み取れたときに出す。「ちゃんと入ったのか」が一目で分かるように。
 * 画面の操作を邪魔しないよう、押しても下に通り抜ける（pointer-events-none）。
 * 動きを減らす設定の人には出さない（globals.css）。
 *
 * burst を変えるたびに、新しく飛び出す。
 */
export function Celebration({ burst }: { burst: number }) {
  const pieces = useMemo(() => (burst > 0 ? makePieces() : []), [burst]);
  if (pieces.length === 0) return null;

  return (
    <div
      key={burst}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              [p.side]: '4%',
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? '50%' : '2px',
              '--dx': `${p.dx}vw`,
              '--dy': `${p.dy}vh`,
              '--rot': `${p.rot}deg`,
              '--dur': `${p.dur}s`,
              '--delay': `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 色は画面の色（globals.css の @theme）から取る。 */
const COLORS = [
  'var(--color-gold)',
  'var(--color-terracotta)',
  'var(--color-matcha)',
  'var(--color-amber)',
  'var(--color-ink)',
];

function makePieces() {
  const out: {
    side: 'left' | 'right';
    w: number;
    h: number;
    color: string;
    round: boolean;
    dx: number;
    dy: number;
    rot: number;
    dur: number;
    delay: number;
  }[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let i = 0; i < 26; i += 1) {
      // 左からは右上へ、右からは左上へ。内側に向かって扇状に広がる。
      const inward = 12 + Math.random() * 42;
      out.push({
        side,
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 9,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        round: Math.random() < 0.25,
        dx: side === 'left' ? inward : -inward,
        dy: -(40 + Math.random() * 38),
        rot: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
        dur: 1.3 + Math.random() * 0.7,
        delay: Math.random() * 0.12,
      });
    }
  }
  return out;
}
