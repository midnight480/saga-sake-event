/**
 * ヘルプ画面の部品。
 *
 * 役割ごとに中身は違うが、並べ方は同じにしておく。当日、別の役割の人に
 * 画面を見せながら説明することがあるので、どこに何が書いてあるかが
 * 共通のほうが伝わりやすい。
 */

import type { ReactNode } from 'react';

/** 見出しと本文のまとまり。 */
export function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline px-5 py-5 first:border-t-0">
      <h2 className="font-display text-[19px] tracking-[0.04em] text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** 順番にやることの並び。番号は自動で振る。 */
export function HelpSteps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[12.5px] leading-[1.9] text-ink/85">
          <span className="flex size-6 flex-none items-center justify-center rounded-full bg-gold/18 text-[11px] font-bold text-gold">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** 説明の段落。 */
export function HelpText({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-[1.9] text-ink-70">{children}</p>;
}

/** 「こうなったら、こうする」の表。当日いちばん引かれるところ。 */
export function HelpTroubles({ rows }: { rows: { when: string; then: ReactNode }[] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div
          key={row.when}
          className="flex flex-col gap-1.5 rounded-card border border-hairline bg-card p-3.5"
        >
          <dt className="text-[12.5px] font-bold leading-snug text-gold-bright">{row.when}</dt>
          <dd className="text-[12px] leading-[1.8] text-ink-70">{row.then}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 覚えておいてほしい一言。 */
export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-gold/35 bg-gold/8 p-3.5 text-[12px] leading-[1.8] text-ink/85">
      {children}
    </p>
  );
}
