'use client';

import { useState, useTransition } from 'react';

import {
  addBrand,
  changeBottles,
  removeBrand,
  setBrandProfile,
  setTicketCost,
} from '@/app/actions';
import {
  AddBox,
  Button,
  Card,
  Chip,
  Empty,
  Eyebrow,
  Note,
  Notice,
  RadioCard,
  ScreenHeader,
  Stepper,
  Title,
  inputClass,
} from '@/components/ui';
import {
  CUPS_PER_BOTTLE,
  MAX_ITEM_DESCRIPTION,
  MAX_TICKET_COST,
  countChars,
  SAKE_KINDS,
  SAKE_RICHNESS,
  SAKE_SWEETNESS,
  tasteTags,
  itemCupsLeft,
  itemTotalCups,
  type BottleSize,
  type Item,
} from '@/lib/domain';
import { TasteTags } from '@/components/TasteTags';
import { useSnapshot } from '@/lib/useSnapshot';

import { useBreweryContext } from '../shell';

const SIZES: BottleSize[] = ['四合瓶', '一升瓶'];

/** STEP 2（蔵側）── 持ち込み登録。 */
export default function BreweryStockPage() {
  const { breweryId } = useBreweryContext();
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 新しい銘柄の入力内容。種類を選ぶと精米歩合とチケット枚数が既定値で入る。
  const [name, setName] = useState('');
  const [kind, setKind] = useState(SAKE_KINDS[3].label); // 純米
  const [polish, setPolish] = useState(SAKE_KINDS[3].polish);
  const [size, setSize] = useState<BottleSize>('四合瓶');
  const [ticketCost, setTicketCost] = useState(SAKE_KINDS[3].ticketCost);
  const [description, setDescription] = useState('');
  const [richness, setRichness] = useState('');
  const [sweetness, setSweetness] = useState('');

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const brewery = snapshot.breweries.find((b) => b.id === breweryId);
  if (!brewery) return <Empty>この蔵の情報が見つかりませんでした。</Empty>;

  const totalCups = brewery.items.reduce((sum, i) => sum + itemTotalCups(i), 0);

  const chooseKind = (label: string) => {
    const preset = SAKE_KINDS.find((k) => k.label === label);
    if (!preset) return;
    setKind(preset.label);
    setPolish(preset.polish);
    setTicketCost(preset.ticketCost);
  };

  const submit = () => {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addBrand({
        breweryId,
        name: name.trim(),
        kind,
        polish,
        size,
        ticketCost,
        description,
        richness,
        sweetness,
      });
      if (result.ok) {
        setName('');
        setDescription('');
        setRichness('');
        setSweetness('');
      } else {
        setError(result.reason);
      }
      await refresh();
    });
  };

  return (
    <>
      <ScreenHeader>
        <Eyebrow>STEP 2</Eyebrow>
        <Title>持ち込み登録</Title>
        <div className="mt-2">
          <Note>
            持ち込む銘柄をご自身で登録し、本数を入れてください。提供できる杯数が自動で出ます
            （四合瓶＝{CUPS_PER_BOTTLE.四合瓶}杯／一升瓶＝{CUPS_PER_BOTTLE.一升瓶}杯換算）
          </Note>
        </div>
      </ScreenHeader>

      <div className="px-5 pt-4">
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      <div className="px-5 pt-4">
        <AddBox title="銘柄を追加する">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="銘柄名（例：七田 純米）"
            className={inputClass}
          />

          <TasteField
            richness={richness}
            sweetness={sweetness}
            onRichness={setRichness}
            onSweetness={setSweetness}
          />

          <DescriptionField value={description} onChange={setDescription} />

          <span className="text-[11.5px] leading-none text-ink-55">種類をえらぶ</span>
          <div role="radiogroup" aria-label="種類" className="grid grid-cols-2 gap-2">
            {SAKE_KINDS.map((k) => (
              <RadioCard
                key={k.label}
                label={k.label}
                active={kind === k.label}
                onClick={() => chooseKind(k.label)}
              />
            ))}
          </div>

          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-[11.5px] leading-none text-ink-55">精米歩合</span>
            <span className="whitespace-nowrap">
              <span className="font-display text-[26px] text-gold">{polish}</span>
              <span className="ml-0.5 text-[12px] text-ink-55">％</span>
            </span>
          </div>
          <input
            type="range"
            className="kura"
            min={0}
            max={100}
            step={1}
            value={polish}
            aria-label="精米歩合"
            onChange={(e) => setPolish(Number(e.target.value))}
            style={{ ['--p' as string]: `${polish}%` }}
          />
          <div className="-mt-1 flex justify-between text-[11.5px] leading-none text-ink-70">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>

          <span className="mt-0.5 text-[11.5px] leading-none text-ink-55">瓶のサイズをえらぶ</span>
          <div role="radiogroup" aria-label="瓶のサイズ" className="grid grid-cols-2 gap-2">
            {SIZES.map((s) => (
              <RadioCard
                key={s}
                label={`${s} ${CUPS_PER_BOTTLE[s]}杯`}
                active={size === s}
                onClick={() => setSize(s)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="text-[11.5px] leading-none text-ink-55">
              1 杯 いただくのに、何ポイント 使うか
            </span>
            <div className="rounded-field border border-hairline-strong bg-card px-3.5 py-2">
              <Stepper
                label="1杯あたりのポイント"
                unit="ポイント"
                value={ticketCost}
                onDecrease={() => setTicketCost((v) => Math.max(1, v - 1))}
                onIncrease={() => setTicketCost((v) => Math.min(MAX_TICKET_COST, v + 1))}
                decreaseDisabled={ticketCost <= 1}
                increaseDisabled={ticketCost >= MAX_TICKET_COST}
              />
            </div>
          </div>

          <Note>
            種類をえらぶと、精米歩合とチケット枚数のよく使う値が自動で入ります。39％や51％などは、
            つまみを動かして合わせてください。
          </Note>

          <Button
            tone="go"
            block
            onClick={submit}
            disabled={pending || !name.trim() || countChars(description) > MAX_ITEM_DESCRIPTION}
          >
            {pending ? '登録しています…' : 'この銘柄を登録する'}
          </Button>
        </AddBox>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        {brewery.items.length === 0 ? (
          <Empty>
            まだ銘柄がありません。
            <br />
            上の欄から、持ち込むお酒を登録してください。
          </Empty>
        ) : (
          brewery.items.map((item) => <ItemCard key={item.id} item={item} />)
        )}
      </div>

      {brewery.items.length > 0 && (
        <div className="px-5 pb-7">
          <div className="flex items-center justify-between rounded-card border border-gold/30 bg-gold/10 p-4">
            <span className="text-[12.5px] leading-none text-ink-70">合計 提供予定</span>
            <span>
              <span className="font-display text-[25px] text-gold">{totalCups}</span>
              <span className="ml-1.5 text-[12px] text-ink-55">杯 ＝ 約 {totalCups} 名分</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function ItemCard({ item }: { item: Item }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cups = itemTotalCups(item);
  const left = itemCupsLeft(item);
  // お渡し済みの分と、受けたけれどまだ渡していない注文の分は残す必要がある。
  // サーバー側（store.changeBottles）と同じ条件にしておかないと、
  // 押せるのに毎回断られるボタンになってしまう。
  const minBottles = Math.ceil((item.usedCups + item.pendingCups) / item.cupsPerBottle);

  const act = (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok && result.reason) setError(result.reason);
      await refresh();
    });
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[18px] tracking-[0.04em] text-ink">{item.name}</span>
          <span className="text-[11px] leading-none text-ink-45">
            {item.kind} / 精米 {item.polish}%
          </span>
          {/* 受付キューで止めた銘柄（Issue #43）。ここで本数を触る人にも分かるように。 */}
          {!item.accepting && (
            <span className="text-[11px] leading-none text-amber">受付停止中（受付キューで再開）</span>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className="rounded-full border border-gold/40 px-2.5 py-1.5 text-[11px] leading-none text-gold">
            {item.size}
          </span>
          <button
            type="button"
            onClick={() => act(() => removeBrand(item.id))}
            aria-label={`${item.name} を削除する`}
            className="size-11 rounded-[9px] border border-hairline-strong text-[13px] text-ink-55 transition-colors hover:border-terracotta/60 hover:text-terracotta-soft"
          >
            ✕
          </button>
        </div>
      </div>

      <ItemProfile item={item} />

      {error && <Notice tone="danger">{error}</Notice>}

      <Stepper
        label="本数"
        unit="本"
        value={item.bottles}
        onDecrease={() => act(() => changeBottles(item.id, -1))}
        onIncrease={() => act(() => changeBottles(item.id, 1))}
        decreaseDisabled={pending || item.bottles <= minBottles}
        increaseDisabled={pending}
      />

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <span className="text-[11.5px] leading-none text-ink-55">
          1 杯 いただくのに、何ポイント 使うか
        </span>
        <div className="rounded-field border border-hairline-strong bg-card px-3.5 py-2">
          <Stepper
            label="1杯あたりのポイント"
            unit="ポイント"
            value={item.ticketCost}
            onDecrease={() => act(() => setTicketCost(item.id, Math.max(1, item.ticketCost - 1)))}
            onIncrease={() =>
              act(() => setTicketCost(item.id, Math.min(MAX_TICKET_COST, item.ticketCost + 1)))
            }
            decreaseDisabled={pending || item.ticketCost <= 1}
            increaseDisabled={pending || item.ticketCost >= MAX_TICKET_COST}
          />
        </div>
      </div>

      <div className="flex justify-between border-t border-hairline pt-2.5 text-[12px] leading-none">
        <span className="flex-none whitespace-nowrap text-ink-55">提供可能</span>
        <span className="flex-none whitespace-nowrap">
          <span className="font-bold text-matcha">{cups}</span>
          <span className="text-ink-55"> 杯 ／ 残り {left} 杯</span>
        </span>
      </div>
    </Card>
  );
}

/**
 * 銘柄の説明（任意、Issue #40）。
 *
 * 初めての人には、銘柄名だけではどんなお酒か分からない。味わいや飲み方を
 * 蔵の言葉で添えてもらい、参加者が銘柄を選ぶ画面に出す。
 */
function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const count = countChars(value);
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between text-[11.5px] leading-none text-ink-55">
        <span>説明（任意）</span>
        <span className={count > MAX_ITEM_DESCRIPTION ? 'text-terracotta-soft' : ''}>
          {count} / {MAX_ITEM_DESCRIPTION}
        </span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="例：すっきりとした辛口。冷やしてどうぞ。"
        className={`${inputClass} resize-y leading-[1.8]`}
      />
    </label>
  );
}

/**
 * 味わいの型（任意）。濃淡と甘辛を 1 つずつ選ぶ。
 *
 * 説明文を読まなくても、初めての人が「淡麗・辛口」のように一目で分かるように。
 * どちらも「えらばない」が初期値。選んだものだけが参加者の画面に出る。
 */
function TasteField({
  richness,
  sweetness,
  onRichness,
  onSweetness,
}: {
  richness: string;
  sweetness: string;
  onRichness: (value: string) => void;
  onSweetness: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <ChoiceRow label="濃淡（任意）" choices={SAKE_RICHNESS} value={richness} onChange={onRichness} />
      <ChoiceRow label="甘辛（任意）" choices={SAKE_SWEETNESS} value={sweetness} onChange={onSweetness} />
    </div>
  );
}

function ChoiceRow({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] leading-none text-ink-55">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        <Chip active={value === ''} onClick={() => onChange('')}>
          えらばない
        </Chip>
        {choices.map((choice) => (
          <Chip key={choice} active={value === choice} onClick={() => onChange(choice)}>
            {choice}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * 登録済みの銘柄の説明と味わいの型。書き直しもここで。
 * 誤字のために銘柄を作り直させない（本数や受けた注文が消えてしまう）。
 */
function ItemProfile({ item }: { item: Item }) {
  const { refresh } = useSnapshot();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [richness, setRichness] = useState<string>(item.richness);
  const [sweetness, setSweetness] = useState<string>(item.sweetness);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDescription(item.description);
    setRichness(item.richness);
    setSweetness(item.sweetness);
    setError(null);
    setEditing(true);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setBrandProfile(item.id, { description, richness, sweetness });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      await refresh();
      setEditing(false);
    });
  };

  const empty = !item.description && tasteTags(item).length === 0;

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <TasteTags item={item} />
        {item.description && (
          <p className="text-[12.5px] leading-[1.8] whitespace-pre-line text-ink-70">
            {item.description}
          </p>
        )}
        {empty && (
          <p className="text-[11.5px] leading-[1.7] text-ink-45">
            味わいと説明はまだありません。初めての方の手がかりになります。
          </p>
        )}
        <Button tone="flat" block onClick={startEditing}>
          {empty ? '味わいと説明を書く' : '味わいと説明を直す'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <TasteField
        richness={richness}
        sweetness={sweetness}
        onRichness={setRichness}
        onSweetness={setSweetness}
      />
      <DescriptionField value={description} onChange={setDescription} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button tone="ghost" className="flex-1" onClick={() => setEditing(false)} disabled={pending}>
          やめる
        </Button>
        <Button
          tone="go"
          className="flex-1"
          onClick={save}
          disabled={pending || countChars(description) > MAX_ITEM_DESCRIPTION}
        >
          {pending ? '保存しています…' : '保存する'}
        </Button>
      </div>
    </div>
  );
}
