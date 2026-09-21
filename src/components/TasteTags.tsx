import { tasteTags, type Item } from '@/lib/domain';

/**
 * 味わいの札（淡麗・辛口 など、Issue #40）。
 *
 * 蔵の登録画面と参加者が銘柄を選ぶ画面で、同じ見た目にする。蔵が「参加者に
 * どう見えるか」をそのまま確かめられるように。何も選ばれていなければ出さない。
 */
export function TasteTags({ item }: { item: Pick<Item, 'richness' | 'sweetness'> }) {
  const tags = tasteTags(item);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-gold/40 px-2.5 py-1 text-[11px] leading-none text-gold"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
