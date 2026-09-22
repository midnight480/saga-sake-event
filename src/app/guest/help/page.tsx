import { Eyebrow, ScreenHeader, Title } from '@/components/ui';
import { LegalHelp } from '@/components/LegalHelp';
import { HelpNote, HelpSection, HelpSteps, HelpText, HelpTroubles } from '@/components/Help';
import { PushSettings } from '@/components/PushSettings';
import { InquiryForm } from '@/components/InquiryForm';

export default function GuestHelpPage() {
  return (
    <>
      <ScreenHeader>
        <Eyebrow>HELP</Eyebrow>
        <Title>使い方</Title>
      </ScreenHeader>

      <PushSettings extraReasons={['注文したお酒ができあがったとき']} />

      <HelpSection title="はじめ方">
        <HelpSteps
          items={[
            <>会場の受付で券をお受け取りください。</>,
            <>
              券の <strong className="text-ink">QR をスマートフォンのカメラで読み取ります</strong>。
              カメラが使えないときは、上のメニューの「チケット」を開いて、QR の下のコードを入れます。
            </>,
            <>
              <strong className="text-ink">ポイント</strong>が入ります。このポイントで
              お酒をいただきます。
            </>,
          ]}
        />
        <HelpNote>
          コードは 1 枚につき一度だけ使えます。読み取ったあとの券は、記念にお持ち帰りください。
          読み取れると明るい音と紙ふぶき、読み取れないと低い音が鳴って画面が揺れます。
        </HelpNote>
      </HelpSection>

      <HelpSection title="QR コードの読み取りかた">
        <HelpSteps
          items={[
            <>
              スマートフォンの<strong className="text-ink">カメラ</strong>を開きます（写真を撮るときと同じアプリです）。
            </>,
            <>QR コードに向けて、枠の中に入るように少し待ちます。</>,
            <>
              画面に出てきた<strong className="text-ink">案内（リンク）を押します</strong>。
              この画面が開きます。
            </>,
          ]}
        />
        <HelpNote>
          この画面の中で券を読むときは、上のメニューの「チケット」を押してください。
          いちばん上に読み取り枠が出るので、「カメラでQRを読み取る」を押して券をかざします。
        </HelpNote>
      </HelpSection>

      <HelpSection title="お酒の頼み方">
        <HelpSteps
          items={[
            <>
              <strong className="text-ink">「酒蔵をさがす」</strong>で、蔵の一覧を見ます。
              いま頼める蔵の数が、いちばん上に出ています。銘柄は「銘柄を見る」で開け、
              銘柄を押すと、その銘柄をリクエストする画面に移ります。
            </>,
            <>
              行きたい蔵をえらびます。銘柄ごとに、必要なポイントと残りの杯数が出ています。
            </>,
            <>
              ブースの前で、銘柄と杯数をえらんで「リクエスト」を押します。
              一度に頼めるのは <strong className="text-ink">3 杯まで</strong>です。
            </>,
            <>
              <strong className="text-ink">マイページ</strong>に移ります。ここで進み具合が
              分かります。
            </>,
            <>
              「ブースで受け取ってください」と出たら、その蔵まで取りに行ってください。
              できあがると、音と振動が鳴り、画面の下に帯が出ます（🔔 にも残ります）。
              音と振動は、マイページの「できあがりの知らせ方」で切り替えられます。
            </>,
            <>
              ブースでお酒を受け取ったら、蔵の人に画面を見せて
              <strong className="text-ink">「受け取りました」</strong>を押してください
              （蔵の人が押してくれることもあります）。
            </>,
            <>
              受け取ると、<strong className="text-ink">記録</strong>の画面に移ります。
              まだ飲んでいない銘柄が分かります（🔔 にも残ります）。
            </>,
            <>
              <strong className="text-ink">受け取ってから、次のリクエストを出せます。</strong>
              受け取る前は、ほかの蔵のお酒も頼めません。
            </>,
          ]}
        />
      </HelpSection>

      <HelpSection title="画面の見方">
        <HelpTroubles
          rows={[
            {
              when: '薄く表示されている蔵',
              then: <>いまのポイントでは頼めない蔵です。あと何ポイント必要かが出ています。</>,
            },
            {
              when: '「混雑」「やや混雑」',
              then: <>待っている人の数です。空いている蔵からまわると、待たずに楽しめます。</>,
            },
            {
              when: '「受付停止中」',
              then: <>その蔵は手が一杯で、いま新しい注文を受けていません。しばらくしてからどうぞ。</>,
            },
            {
              when: '銘柄に「停止中」',
              then: (
                <>
                  その銘柄だけ、蔵がいま受付を止めています。完売ではないので、しばらくすると
                  頼めるようになることがあります。
                </>
              ),
            },
            {
              when: '銘柄に取り消し線',
              then: <>その銘柄は完売です。ほかの銘柄をおえらびください。</>,
            },
            {
              when: '「他のリクエスト対応中」と出て押せない',
              then: (
                <>
                  まだ受け取っていないリクエストがあります（その銘柄には「リクエスト済み」と
                  出ます）。マイページで様子を見て、受け取ってから次をどうぞ。
                </>
              ),
            },
          ]}
        />
      </HelpSection>

      <HelpSection title="注文したあとの言葉">
        <HelpTroubles
          rows={[
            { when: '受付済', then: <>蔵が注文を受け取りました。お待ちください。</> },
            { when: '準備中', then: <>いま注いでいます。ブースの前でお待ちください。</> },
            { when: '準備完了 受取可', then: <>できあがりました。ブースで受け取ってください。</> },
            { when: '受渡完了', then: <>お渡し済みです。</> },
            { when: 'キャンセル', then: <>取り消された注文です。使ったポイントは戻っています。</> },
          ]}
        />
      </HelpSection>

      <HelpSection title="記録を見る">
        <HelpText>
          上のメニューの<strong className="text-ink">「記録」</strong>で、どの蔵のどの銘柄を何杯いただいたかと、
          これまでの注文を時刻つきで見られます。数えるのは受け取ったお酒だけです。
          蔵の行を押すと、その蔵の銘柄が開きます。
        </HelpText>
        <HelpText>
          いちばん上には<strong className="text-ink">称号</strong>が出ます。受け取った銘柄の数が
          増えるほど「素面」「ほろ酔い」…と上がり、すべての蔵のすべての銘柄を飲み干すと
          「酒呑童子」になります。ひとつの蔵の全銘柄で「蔵の主」、すべての蔵で 1 銘柄ずつで
          「蔵めぐり名人」も取れます。
        </HelpText>
      </HelpSection>

      <HelpSection title="困ったとき">
        <HelpTroubles
          rows={[
            {
              when: 'ポイントが足りない',
              then: (
                <>
                  受付で券を追加でお求めください。上のメニューの「チケット」から、新しい券のコードを
                  入れるとポイントが増えます。
                </>
              ),
            },
            {
              when: '「この券はすでに読み取り済みです」と出る',
              then: <>その券はもう使われています。受付でお確かめください。</>,
            },
            {
              when: '「この券は登録されていません」と出る',
              then: <>コードの打ち間違いがないかお確かめください。O と 0、I と 1 にご注意ください。</>,
            },
            {
              when: '開始までリクエストは送れません、と出る',
              then: <>まだ開始時刻になっていません。時刻をお待ちください。</>,
            },
            {
              when: '通信が不安定です、と黄色い帯が出る',
              then: <>電波の弱い場所です。少し移動すると、自動で新しくなります。</>,
            },
          ]}
        />
      </HelpSection>

      <InquiryForm />
      <LegalHelp />
    </>
  );
}
