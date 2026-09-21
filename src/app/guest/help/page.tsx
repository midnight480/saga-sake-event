import { Eyebrow, ScreenHeader, Title } from '@/components/ui';
import { HelpNote, HelpSection, HelpSteps, HelpText, HelpTroubles } from '@/components/Help';
import { InquiryForm } from '@/components/InquiryForm';

export default function GuestHelpPage() {
  return (
    <>
      <ScreenHeader>
        <Eyebrow>HELP</Eyebrow>
        <Title>使い方</Title>
      </ScreenHeader>

      <HelpSection title="はじめ方">
        <HelpSteps
          items={[
            <>会場の受付で券をお受け取りください。</>,
            <>
              下の<strong className="text-ink">「チケット」</strong>を開き、券に書かれた
              コードを入れます。
            </>,
            <>
              <strong className="text-ink">ポイント</strong>が入ります。このポイントで
              お酒をいただきます。
            </>,
          ]}
        />
        <HelpNote>
          コードは 1 枚につき一度だけ使えます。読み取ったあとの券は、記念にお持ち帰りください。
        </HelpNote>
      </HelpSection>

      <HelpSection title="お酒の頼み方">
        <HelpSteps
          items={[
            <>
              <strong className="text-ink">「酒蔵をさがす」</strong>で、蔵の一覧を見ます。
              いま頼める蔵の数が、いちばん上に出ています。
            </>,
            <>
              行きたい蔵をえらびます。銘柄ごとに、必要なポイントと残りの杯数が出ています。
            </>,
            <>ブースの前で、銘柄と杯数をえらんで「リクエスト」を押します。</>,
            <>
              <strong className="text-ink">マイページ</strong>に移ります。ここで進み具合が
              分かります。
            </>,
            <>
              「ブースで受け取ってください」と出たら、その蔵まで取りに行ってください。
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
              when: '銘柄に取り消し線',
              then: <>その銘柄は完売です。ほかの銘柄をおえらびください。</>,
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

      <HelpSection title="困ったとき">
        <HelpTroubles
          rows={[
            {
              when: 'ポイントが足りない',
              then: (
                <>
                  受付で券を追加でお求めください。下の「チケット」から、新しい券のコードを
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
    </>
  );
}
