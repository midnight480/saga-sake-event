import { Eyebrow, ScreenHeader, Title } from '@/components/ui';
import { HelpNote, HelpSection, HelpSteps, HelpText, HelpTroubles } from '@/components/Help';
import { PushSettings } from '@/components/PushSettings';
import { InquiryForm } from '@/components/InquiryForm';

export default function BreweryHelpPage() {
  return (
    <>
      <ScreenHeader>
        <Eyebrow>HELP</Eyebrow>
        <Title>酒蔵の使い方</Title>
      </ScreenHeader>

      <PushSettings extraReasons={['参加者から新しいリクエストが届いたとき']} />

      <HelpSection title="開場前に、この順で">
        <HelpSteps
          items={[
            <>
              <strong className="text-ink">持ち込み登録</strong>を開きます。
            </>,
            <>
              銘柄名を入れ、種類をえらびます。種類をえらぶと、精米歩合とポイントの
              よく使う値が自動で入ります。
            </>,
            <>
              よければ<strong className="text-ink">味わい（淡麗・濃醇、甘口〜辛口）</strong>をえらび、
              <strong className="text-ink">説明</strong>を添えてください（どちらも任意）。
              初めての方が、どんなお酒かを知る手がかりになります。登録したあとでも直せます。
            </>,
            <>
              <strong className="text-ink">1 杯 いただくのに何ポイント使うか</strong>を決めます。
              銘柄ごとに変えられます。
            </>,
            <>瓶のサイズをえらんで「この銘柄を登録する」。</>,
            <>
              登録したら、<strong className="text-ink">本数</strong>を ＋ で入れます。
              提供できる杯数が自動で出ます（四合瓶 = 6 杯 / 一升瓶 = 15 杯）。
            </>,
          ]}
        />
        <HelpNote>
          本数を入れないと、参加者からは「完売」に見えます。持ち込んだ本数を
          必ず入れてください。
        </HelpNote>
      </HelpSection>

      <HelpSection title="当日の進め方">
        <HelpText>
          <strong className="text-ink">受付キュー</strong>を開いたままにしてください。
          参加者が注文すると、ここに並びます。
        </HelpText>
        <HelpText>
          新しいリクエストが来ると、画面の下に帯が出て、タブの題名に件数が付きます。
          開場前に、受付キューの「新しいリクエストの知らせ方」→「変える」で、
          <strong className="text-ink">音・振動・画面をつけたまま・スマホの通知</strong>
          を選んでおいてください。手がふさがっていても気づけます。
        </HelpText>
        <HelpNote>
          音は、画面に一度触れるまで鳴りません（ブラウザの決まり）。「音」を押すと試し音が
          鳴り、鳴る状態になります。iPhone は消音スイッチが入っていると鳴らず、振動も
          使えません。iPhone では「スマホの通知」も合わせて使ってください。
        </HelpNote>
        <HelpText>1 件ずつ、次の順にボタンを押します。</HelpText>
        <div className="rounded-card border border-hairline bg-card p-4 font-mono text-[11.5px] leading-[2] text-ink-70">
          受付済
          <br />
          　→ 準備中にする
          <br />
          　→ 準備完了にする
          <br />
          　→ 受渡完了
        </div>
        <HelpNote>
          「受渡完了」を押した瞬間に在庫が減ります。お客さまにお渡ししてから
          押してください。
        </HelpNote>
        <HelpText>
          押すたびに、参加者の画面の言葉が変わります。「準備中にする」を押せば、
          参加者には「いま注いでいます。ブース前でお待ちください」と出ます。
        </HelpText>
      </HelpSection>

      <HelpSection title="手が回らなくなったら">
        <HelpText>
          受付キューの上にある
          <strong className="text-ink">「新規リクエストを一時停止する」</strong>
          を押してください。確認が出るので「はい、止めます」を押すと、参加者の画面に
          「受付停止中」と出て、新しい注文が来なくなります。
        </HelpText>
        <HelpText>
          すでに受けている注文は残るので、落ち着いてから片付けてください。
          再開するときは「受付を再開する」です。
        </HelpText>
        <HelpText>
          <strong className="text-ink">銘柄ごとに止める</strong>こともできます。受付キューの
          「銘柄ごとに受付を止める」を開き、止めたい銘柄の「止める」を押してください。
          瓶を開け直している間だけ止める、といった使い方ができます。
        </HelpText>
        <HelpNote>
          止めたままにすると、主催者の画面で黄色く表示されます。再開を忘れないよう
          気をつけてください。
        </HelpNote>
      </HelpSection>

      <HelpSection title="困ったとき">
        <HelpTroubles
          rows={[
            {
              when: 'ログインできない',
              then: (
                <>
                  蔵ID（kura-001 など）とパスワードをもう一度お確かめください。
                  分からなくなったら、主催者に「再発行」をお願いしてください。
                  その場で新しいパスワードが出ます。
                </>
              ),
            },
            {
              when: '本数を減らせない',
              then: (
                <>
                  お渡しした分と、いま受けている注文の分は残す必要があります。
                  先に受付キューを片付けてから、減らしてください。
                </>
              ),
            },
            {
              when: '銘柄を消せない',
              then: (
                <>
                  すでに注文が入った銘柄は消せません（履歴が壊れるためです）。
                  本数を 0 にすると、参加者からは「完売」に見えます。
                </>
              ),
            },
            {
              when: '注文が届かない',
              then: (
                <>
                  主催者が受付を開いていない可能性があります。あわせて、自分の蔵が
                  「受付停止中」になっていないかもお確かめください。
                </>
              ),
            },
            {
              when: '間違えて「受渡完了」を押した',
              then: (
                <>
                  その注文は元に戻せません。参加者のポイントを戻したい場合は、
                  主催者にお伝えください。
                </>
              ),
            },
          ]}
        />
      </HelpSection>

      <InquiryForm />
    </>
  );
}
