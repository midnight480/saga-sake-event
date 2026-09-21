import { Eyebrow, ScreenHeader, Title } from '@/components/ui';
import { HelpNote, HelpSection, HelpSteps, HelpText, HelpTroubles } from '@/components/Help';
import { PushSettings } from '@/components/PushSettings';

export default function OrganizerHelpPage() {
  return (
    <>
      <ScreenHeader>
        <Eyebrow>HELP</Eyebrow>
        <Title>主催者の使い方</Title>
      </ScreenHeader>

      <PushSettings />

      <HelpSection title="当日までに、この順で">
        <HelpSteps
          items={[
            <>
              <strong className="text-ink">イベント設定</strong>で、開催日と開始・終了時刻を入れます。
              受付はこの時刻の間だけ自動で開きます。
            </>,
            <>
              同じ画面で、<strong className="text-ink">前売券・当日券のポイント</strong>を決めます。
              券を 1 枚 受け取った人に何ポイント渡すか、という設定です。
            </>,
            <>
              <strong className="text-ink">蔵アカウント</strong>で、出展する酒蔵を登録します。
              蔵IDとパスワードが出るので、印刷して各蔵にお渡しください。
            </>,
            <>
              <strong className="text-ink">チケットQR</strong>で、券を必要な枚数 刷ります。
              券は 1 枚ごとに QR が付いた形で印刷されます。切り離して受付に置いてください。
            </>,
            <>各蔵に「開場前に銘柄と本数を登録してください」と伝えます。</>,
          ]}
        />
        <HelpNote>
          パスワードは、発行した直後の 1 回しか表示できません。控え忘れても
          「再発行」でいつでも作り直せます。
        </HelpNote>
      </HelpSection>

      <HelpSection title="券とポイントの関係">
        <HelpText>
          券の QR には、その券だけのコードが入っています。参加者がスマートフォンの
          カメラで読み取ると、その場でポイントが入ります。カメラが使えない人は、
          QR の下に書かれたコードを打ち込めます。
        </HelpText>
        <HelpText>
          コードは 1 人 1 枚、一度だけ使えます。使い終わったコードは
          「チケットQR」の一覧で取り消し線が付きます。
        </HelpText>
        <HelpNote>
          関係者に多めに配りたいときは、前売券のポイントを多めにして、その券を
          関係者にお渡しください。別の仕組みは要りません。
        </HelpNote>
      </HelpSection>

      <HelpSection title="当日、見るところ">
        <HelpText>
          ダッシュボードを開いたままにしてください。4 秒ごとに自動で新しくなります。
        </HelpText>
        <HelpTroubles
          rows={[
            {
              when: '金色の帯「チケットだけが売り切れています」',
              then: (
                <>
                  当日券が 0 枚なのに、会場にはまだ注げるお酒がある状態です。
                  帯の中のボタンから当日券を追加で刷れます。押した直後から、参加者の画面も動きます。
                </>
              ),
            },
            {
              when: '赤い帯「応答遅延アラート」',
              then: <>その蔵が注文を受けたまま 12 分以上 動いていません。蔵まで見に行ってください。</>,
            },
            {
              when: '黄色いカードの蔵',
              then: <>その蔵が自分で受付を止めています。再開は蔵の画面からです。</>,
            },
            {
              when: '残量バーが赤い蔵',
              then: <>残りが 2 割を切っています。そろそろ品切れです。</>,
            },
            {
              when: '「混雑」が出ている蔵',
              then: <>待ちが 3 件以上あります。空いている蔵へ誘導すると流れがよくなります。</>,
            },
          ]}
        />
      </HelpSection>

      <HelpSection title="困ったとき">
        <HelpTroubles
          rows={[
            {
              when: '蔵が「ログインできない」と言っている',
              then: (
                <>
                  蔵アカウントの一覧で、その蔵に「ログインアカウント未作成」が出ていないか
                  見てください。出ていればボタンを押すと作成されます。
                  パスワードを忘れた場合は「再発行」でその場で新しいものが出ます。
                </>
              ),
            },
            {
              when: '参加者が「コードが使えない」と言っている',
              then: (
                <>
                  「チケットQR」の一覧でそのコードを探してください。
                  <strong className="text-ink">使用済</strong>と出ていれば、その券はもう使われています。
                  一覧に無ければ、別のイベントの紙が混ざっています。
                </>
              ),
            },
            {
              when: '時間になっても参加者が注文できない',
              then: (
                <>
                  イベント設定の「いまの受付」を見てください。開始時刻を過ぎていれば
                  「受付中」になります。「停止中（手動）」なら、
                  「予定どおりにもどす」を押してください。
                </>
              ),
            },
            {
              when: '早めに始めたい / 早めに止めたい',
              then: (
                <>
                  イベント設定の「いますぐ受付を開く／止める」で、予定を上書きできます。
                  上書き中は「予定どおりにもどす」で戻せます。
                </>
              ),
            },
          ]}
        />
      </HelpSection>

      <HelpSection title="閉場するとき">
        <HelpText>
          終了時刻になると自動で受付が閉じます。早く閉じたいときだけ、
          イベント設定から手で止めてください。
        </HelpText>
        <HelpText>
          止める前に、ダッシュボードの「対応待ち」が 0 になっているか確かめてください。
          残っていると、受け取れていない方がいます。
        </HelpText>
      </HelpSection>
    </>
  );
}
