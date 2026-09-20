'use client';

import { useState, useTransition } from 'react';

import { addBrewery, moveBooth, regenerateBreweryPassword, removeBrewery } from '@/app/actions';
import {
  AddBox,
  Button,
  Card,
  Empty,
  Eyebrow,
  Note,
  Notice,
  RadioCard,
  SectionLabel,
  ScreenHeader,
  Title,
  inputClass,
} from '@/components/ui';
import { SAGA_AREAS, type Brewery } from '@/lib/domain';
import { useSnapshot } from '@/lib/useSnapshot';

/** 発行直後に 1 度だけ見せる資格情報。閉じると二度と出せない。 */
interface Credential {
  breweryId: string;
  loginId: string;
  password: string;
}

/** STEP 2 ── 蔵アカウントの発行。 */
export default function BreweriesPage() {
  const { snapshot, isInitialLoading, refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);

  const [name, setName] = useState('');
  const [area, setArea] = useState<string>(SAGA_AREAS[0]);

  if (isInitialLoading || !snapshot) return <Empty>読み込んでいます…</Empty>;

  const breweries = snapshot.breweries;

  const submit = () => {
    if (!name.trim()) return;
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await addBrewery({ name: name.trim(), area });
      if (!result.ok) {
        setError(result.reason);
      } else if (result.value) {
        setName('');
        setCredential({
          breweryId: '',
          loginId: result.value.loginId,
          password: result.value.password,
        });
        if (result.value.warning) setWarning(result.value.warning);
      }
      await refresh();
    });
  };

  return (
    <>
      <ScreenHeader>
        <Eyebrow>STEP 2</Eyebrow>
        <Title>蔵アカウントの発行</Title>
        <div className="mt-2">
          <Note>
            蔵の名前を登録すると、IDは連番で自動、パスワードは自動生成されます。印刷して蔵にお渡しください。
          </Note>
        </div>
      </ScreenHeader>

      <div className="px-5 pt-4">
        {error && <Notice tone="danger">{error}</Notice>}
      </div>

      {credential && (
        <div className="px-5 pt-4">
          <CredentialCard credential={credential} onClose={() => setCredential(null)} />
        </div>
      )}

      {warning && (
        <div className="px-5 pt-4">
          <Notice tone="warn" title="ログインアカウントを作れませんでした">
            {warning}
          </Notice>
        </div>
      )}

      <div className="px-5 pt-4">
        <AddBox title="出展する酒蔵を追加">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="酒蔵名（例：天山酒造）"
            className={inputClass}
          />
          <span className="text-[11.5px] leading-none text-ink-55">所在地をえらぶ</span>
          <div role="radiogroup" aria-label="所在地" className="grid grid-cols-2 gap-2">
            {SAGA_AREAS.map((a) => (
              <RadioCard key={a} label={a} active={area === a} onClick={() => setArea(a)} />
            ))}
          </div>
          <Button tone="go" block onClick={submit} disabled={pending || !name.trim()}>
            {pending ? '発行しています…' : '登録してID・パスワードを発行'}
          </Button>
        </AddBox>
      </div>

      <SectionLabel>発行済み {breweries.length} 蔵</SectionLabel>
      <div className="flex flex-col gap-3 px-5 pb-5">
        {breweries.length === 0 ? (
          <Empty>まだ登録されていません。上の欄から追加してください。</Empty>
        ) : (
          breweries.map((brewery) => <BreweryCard key={brewery.id} brewery={brewery} />)
        )}
      </div>

      {breweries.length > 0 && (
        <div className="px-5 pb-5">
          <Button
            tone="gold"
            block
            onClick={() => window.open('/organizer/breweries/print', '_blank')}
          >
            全蔵のID・パスワードを作り直して印刷する
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-5 pb-7 text-[11.5px] leading-[1.8] text-ink-55">
        <p>
          <span className="font-bold text-gold">パスワードの決まり</span>
          ：紛らわしい文字を除いた14文字をその場で自動生成します。よく使われる語や漏えい済みの
          パスワードは、ログインの仕組み（Clerk）側で弾かれます（NIST SP 800-63B の考え方）。
        </p>
        <p>
          <span className="font-bold text-gold">保存しません</span>
          ：発行したパスワードはこのアプリに残しません。表示は発行直後の 1 回だけです。
          紙をなくしたときは「再発行」を押せば、新しいものがすぐ出ます。
        </p>
        <p>
          定期変更は求めません。漏えいの疑いがあるときだけ再発行してください。当日、蔵の担当者が
          変わったときも再発行で対応できます。
        </p>
      </div>
    </>
  );
}

/** 発行直後の資格情報。ここを閉じると再表示できないことを明示する。 */
function CredentialCard({
  credential,
  onClose,
}: {
  credential: Credential;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `蔵ID: ${credential.loginId}\nパスワード: ${credential.password}`,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-gold/60 bg-gold/10 p-4">
      <div className="text-[12px] font-bold leading-none tracking-[0.08em] text-gold">
        この蔵にお渡しするログイン情報
      </div>
      <dl className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2.5">
          <dt className="flex-none text-[11.5px] leading-none text-ink-55">蔵ID</dt>
          <dd className="font-mono text-[15px] font-bold whitespace-nowrap text-ink">
            {credential.loginId}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2.5">
          <dt className="flex-none text-[11.5px] leading-none text-ink-55">パスワード</dt>
          <dd className="font-mono text-[15px] font-bold whitespace-nowrap text-gold">
            {credential.password}
          </dd>
        </div>
      </dl>
      <p className="text-[11.5px] leading-[1.7] text-ink/85">
        この画面を閉じると、もう表示できません。紙に書き写すか、下のボタンでコピーしてお渡しください。
        見失っても「再発行」でいつでも作り直せます。
      </p>
      <div className="flex gap-2">
        <Button tone="gold" className="flex-1" onClick={copy}>
          {copied ? 'コピーしました' : 'コピーする'}
        </Button>
        <Button tone="flat" className="flex-1" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </div>
  );
}

function BreweryCard({ brewery }: { brewery: Brewery }) {
  const { refresh } = useSnapshot();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [fresh, setFresh] = useState<Credential | null>(null);
  const [error, setError] = useState<string | null>(null);

  const regenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await regenerateBreweryPassword(brewery.id);
      if (result.ok && result.value) {
        setFresh({ breweryId: brewery.id, ...result.value });
      } else if (!result.ok) {
        setError(result.reason);
      }
      await refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await removeBrewery(brewery.id);
      if (!result.ok) setError(result.reason);
      setConfirming(false);
      await refresh();
    });
  };

  const shiftBooth = (direction: 1 | -1) => {
    startTransition(async () => {
      const result = await moveBooth(brewery.id, direction);
      if (!result.ok) setError(result.reason);
      await refresh();
    });
  };

  return (
    <Card animate>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[19px] tracking-[0.04em] text-ink">
            {brewery.name}
          </span>
          <span className="text-[11.5px] leading-none text-ink-55">{brewery.area}</span>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`${brewery.name} を削除する`}
          className="size-11 flex-none rounded-[9px] border border-hairline-strong text-[15px] text-ink-55 transition-colors hover:border-terracotta/60 hover:text-terracotta-soft"
        >
          ✕
        </button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {confirming && (
        <div className="flex flex-col gap-2.5 rounded-field border border-terracotta/50 bg-terracotta/12 p-3.5">
          <span className="text-[12.5px] leading-[1.7] text-ink/90">
            この蔵のアカウントを削除しますか。登録した銘柄も消えます。
          </span>
          <div className="flex gap-2">
            <Button tone="ghost" className="flex-1" onClick={() => setConfirming(false)}>
              やめる
            </Button>
            <Button tone="danger" className="flex-1" onClick={remove} disabled={pending}>
              削除する
            </Button>
          </div>
        </div>
      )}

      <dl className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-2.5">
          <dt className="flex-none text-[11.5px] leading-none text-ink-55">蔵ID</dt>
          <dd className="font-mono text-[15px] font-bold whitespace-nowrap text-ink">
            {brewery.loginId}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2.5">
          <dt className="flex-none text-[11.5px] leading-none text-ink-55">ブース</dt>
          <dd className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftBooth(-1)}
              aria-label="ブースを前にずらす"
              className="size-11 rounded-[9px] border border-hairline-strong text-ink-55 hover:text-ink"
            >
              ‹
            </button>
            <span className="min-w-14 text-center font-mono text-[15px] font-bold text-ink">
              {brewery.booth || '未割当'}
            </span>
            <button
              type="button"
              onClick={() => shiftBooth(1)}
              aria-label="ブースを次にずらす"
              className="size-11 rounded-[9px] border border-hairline-strong text-ink-55 hover:text-ink"
            >
              ›
            </button>
          </dd>
        </div>
      </dl>

      {fresh ? (
        <div className="flex flex-col gap-2 rounded-field border border-gold/60 bg-gold/10 p-3.5">
          <span className="text-[11.5px] leading-none text-gold">新しいパスワード</span>
          <span className="font-mono text-[17px] font-bold break-all text-ink">
            {fresh.password}
          </span>
          <p className="text-[11px] leading-[1.7] text-ink/85">
            閉じると再表示できません。お渡しし終えたら閉じてください。
          </p>
          <Button tone="flat" onClick={() => setFresh(null)}>
            閉じる
          </Button>
        </div>
      ) : (
        <Button tone="gold" block onClick={regenerate} disabled={pending}>
          {pending ? '作成しています…' : 'パスワードを再発行する'}
        </Button>
      )}
    </Card>
  );
}
