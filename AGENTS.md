# AGENTS.md — このリポジトリで作業する人／エージェントへ

佐賀の酒蔵が集まる合同試飲イベントの運営 Web サービス。
**主催者 / 酒蔵 / 参加者** の 3 者が同じデータを見て動く。

設計の背景・判断の理由は [`DESIGN.md`](DESIGN.md) にある。**変更を加える前に
必ず読むこと。** ここに書いてあるのは「どう作業するか」だけ。

---

## この 3 つを壊さない

作業中に迷ったら、次の 3 つを優先する。ほかのきれいさは後回しでいい。

### 1. 環境変数が無くても、ビルドと起動が成功すること

主催者（非エンジニア）は **まず何も設定せずにデプロイし、そのあと Vercel の
画面で Neon と Clerk を追加する**。もし環境変数が無い状態でアプリが落ちると、
案内すべき `/setup` すら開けず、主催者は真っ白なエラー画面の前で詰む。

守るために:

- モジュールのトップレベルで DB に接続しない（`getSql()` は使う瞬間に呼ぶ）
- `middleware.ts` / `layout.tsx` は Clerk の鍵が無ければ Clerk を通さない
- `/setup` は DB も Clerk も使わずに描画できる状態を保つ
- 設定を見るページには `export const dynamic = 'force-dynamic'` を付ける

**確認方法**: `DATABASE_URL='' CLERK_SECRET_KEY='' NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='' npm run build`

### 2. 在庫とポイントが二重に動かないこと

当日は同じ在庫を複数の端末が同時に触る。二重に減る／戻ると、その場で誰も
原因を突き止められない。

**「読んで、考えて、書く」を別々の SQL に分けてはいけない。**
条件を `WHERE` に入れた 1 本の SQL（CTE 付き UPDATE）で書き、0 行返ってきたら
失敗と判断する。それで足りない場合は **PL/pgSQL 関数**にして、行ロックの中で
順番に実行する。既存の実装をそのまま真似ること:

- `redeemTicket` … 券の消し込み＋加算（1 文）
- `place_order` … 残高・在庫・受付状態の確認と引き落とし（関数）
- `setRequestStatus` … 状態遷移＋在庫減／ポイント返却（1 文）
- `sendDueNotices` … 記録を先に作り、作れたときだけ送る

### 3. 主催者に触らせる設定を増やさないこと

いま主催者が入力するのは `ORGANIZER_EMAILS` **1 つだけ**。ほかはすべて自動で
入るか、自動で作られる（DB と Clerk の鍵は Vercel の連携、VAPID 鍵は初回に
自動生成して DB へ、スキーマは初回アクセス時に自動適用）。

**必須の環境変数を増やさない。** どうしても必要なら `/setup` の診断項目も
同時に追加し、`docs/デプロイ手順.md` にクリックする場所まで書くこと。

---

## ファイルの地図

```
src/
  lib/
    domain.ts      型と計算式。DB もネットワークも触らない純粋な関数だけ
    schema-sql.ts  テーブル・関数の定義（SQL そのもの）。import を一切持たない
    schema.ts      それを適用する処理（ensureSchema）
    db.ts          Neon 接続。使う瞬間まで接続を遅らせる
    env.ts         環境変数の名前ゆれを吸収する
    env-init.ts    読み込まれた瞬間に名前をそろえる副作用モジュール
    store.ts       DB の読み書き。外に出るのは domain.ts の型だけ
    auth.ts        役割の判定と番人。Edge からも読まれるので依存を増やさない
    push.ts        お知らせの送信。VAPID 鍵の自動生成もここ
    pwa.ts         ホーム画面への追加まわりの、端末ごとの事情
    setup-state.ts /setup の診断
    useSnapshot.ts 会場の現在値を 4 秒ごとに購読するフック
  components/
    ui.tsx           画面部品。色と余白はここに閉じ込める
    AppShell.tsx     3 役割共通の外枠（ヘッダ・下タブ）
    Help.tsx         ヘルプの部品
    InquiryForm.tsx  主催者への問い合わせ
    PushSettings.tsx お知らせの受け取り設定
    InstallHint.tsx  ホーム画面への追加をすすめる案内
  app/
    actions.ts      画面から呼ぶ操作。権限確認はすべてここ
    api/snapshot/   会場の現在値を返す口（ポーリング先・節目のお知らせもここ）
    api/qr/         受付に貼る共通 QR
    opengraph-image.tsx  リンクを貼ったときに出る画像
    setup/          セットアップ診断
    brewery-login/  酒蔵専用のログイン
    organizer/      主催者
    brewery/        酒蔵
    guest/          参加者
  assets/
    kaisei-subset.ttf  OGP と favicon で使う書体（使う文字だけ切り出し）
scripts/
  check-schema.mjs  実際の Postgres に対する検証
docs/               主催者向けの日本語手順書
```

### 依存の向き

```
app/(画面)  →  components/  →  lib/domain.ts
     ↓
app/actions.ts  →  lib/auth.ts  →  lib/db.ts
     ↓                              ↑
lib/store.ts  →  lib/schema.ts  →  lib/schema-sql.ts
     ↓
lib/domain.ts
```

- **`lib/domain.ts` は何にも依存しない。** ここに DB や Clerk を import したら
  設計が崩れている合図
- **`lib/schema-sql.ts` も何も import しない。** 検証スクリプトがここだけを
  読み込んで実際の Postgres に流せるようにするため
- **`lib/auth.ts` から `lib/store.ts` を import しない。** `auth.ts` は
  ミドルウェア（Edge ランタイム）からも読まれるが、`store.ts` は `node:crypto`
  を使うのでビルドが壊れる。一文で済む問い合わせは `auth.ts` に直接書く

---

## コマンド

```bash
npm run dev         # 開発サーバー
npm run build       # 本番ビルド（環境変数なしでも通ること）
npm run typecheck   # 型検査。ビルドは型で落とさないので、ここで必ず確認する
npm run verify:sql  # 実際の Postgres に対する検証
```

`next.config.ts` で `typescript.ignoreBuildErrors = true` にしているのは、
主催者が GitHub 上で直接ファイルを編集したときに誤字ひとつで当日の
デプロイが止まるのを避けるため。**開発では `npm run typecheck` を必ず通す。**

### SQL を実際の Postgres で検証する

**SQL を触ったら必ず走らせる。** CI でも毎回走る。

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=x PGDATABASE=saga \
  npm run verify:sql
```

Postgres は docker でも `embedded-postgres`（npm）でも構わない。確かめること:

- スキーマを **2 回**流して壊れない（初回アクセス時に自動適用するため）
- `store.ts` などの中の SQL 全件を `PREPARE` に通し、**存在しない列・表**を検出
- `place_order` の挙動と、**同時注文で売り過ぎないこと**
- **同じ券を同時に読んでも 1 回しか加算されないこと**
- 受渡・キャンセルで数字が二重に動かないこと

SQL は `src/lib/schema-sql.ts` にある。**出典を 1 か所にするため、スクリプト側に
SQL を書き写さない。**

### Neon なしでアプリ全体を動かす

Neon のドライバは Neon の HTTP 口とだけ話すので、ローカルの Postgres には
そのままつながらない。同じ形式を話す中継を立てて `NEON_FETCH_ENDPOINT` を
指すと、Neon のアカウントなしで全体を通せる（`db.ts` 参照。本番ではこの
環境変数を設定しないので経路は変わらない）。

中継は Neon の SQL-over-HTTP を実装すればよい:
`POST` で `{query, params}`（バッチは `{queries:[…]}` → `{results:[…]}`）を受け、
`Neon-Raw-Text-Output` に合わせて**値を文字列のまま**返し、`fields[].dataTypeID`
を添える（型変換はドライバ側が行う）。

**この経路で実際に不具合が見つかっている。** 日付・時刻に触る変更をしたら、
ここまで通して確かめること。

---

## 書き方の決まり

### コメントは日本語で、「なぜ」を書く

このリポジトリは日本語で運用する。コードが何をしているかは読めば分かるので、
**なぜそうしたか**、特に「素直に書くとこうなるが、こういう事情でこうした」を
書く。既存のコメントの密度と文体に合わせること。

### 色・余白を画面に直書きしない

`src/app/globals.css` の `@theme` にトークンを定義し、Tailwind のクラス
（`bg-card` `text-gold` `border-hairline`）で参照する。

### 計算は `domain.ts` に集める

杯数・ポイント・混雑の判定を画面で計算しない。サーバーとブラウザで同じ式を
使うことで「画面ごとに数が違う」を防いでいる。

### 単位の使い分け

**紙の券だけが「枚」。** 参加者の残高と銘柄の値段は「**ポイント**」。
以前はどちらも「枚」で、券 1 枚 → チケット 10 枚 → 1 杯 1 枚 と 3 つの意味が
混ざって読めなくなっていた。画面の文言を書くときは必ず意識すること。

### 時刻は日本時間で組み立てる

**`now.getHours()` を使わない。** Vercel のサーバーは UTC で動くので 9 時間
ずれる。開催日と時刻から `+09:00` を付けて絶対時刻に直す（`scheduleWindow`）。
日付の整形も `toISOString()` ではなくローカルの年月日を組み立てる。

### 触る部品は 44px 以上

スマホの実機で確実に押せる高さを保つ。`components/ui.tsx` の `Button` は
`min-h-12`（48px）が既定。

### 画面幅はスマホに合わせる

**480px までに抑えて中央に置く。** 3 者とも会場を歩き回るので、大きな画面
向けの別レイアウトは作らない。同じ見え方であること自体が、当日の口頭の案内を
成立させている。

### iOS / Android の両方で動かす

片方でしか動かない API を使わない。特に:

- 入力欄の `font-size` を 16px 未満にしない
- `<video>` に `playsInline` を必ず付ける
- 画面下端の余白は `env(safe-area-inset-bottom)` を使う
- iOS はホーム画面に追加しないと通知を受け取れない

### 失敗を日本語で返す

操作の戻り値は `{ ok: true }` / `{ ok: false, reason: '…' }` にそろえる。
`reason` は**そのまま画面に出せる日本語**にする。

**決めつけた案内を書かない。** 以前「Username を有効にしてください」と固定で
出していたため、原因が別（メールアドレス必須）のときに誤った方向へ誘導して
時間を使わせた。外部のサービスが返した理由は、そのまま見せること。

### 取り返しのつかない操作には確認を挟む

`ConfirmDialog` を使う。**「いいえ」を赤く、「はい」を通常の見た目**にする。
迷ったときにやめる側へ手が向くようにするため。

確認の文面には**何がいくつ消えるか**を数で出す。「本当によろしいですか」だけでは
判断できない。

---

## 変更したら確認すること

- [ ] `npm run typecheck` が通る
- [ ] `npm run build` が **環境変数なしで** 通る
- [ ] SQL を触ったなら `npm run verify:sql` が通る
- [ ] 在庫・ポイントに関わる変更なら、`check-schema.mjs` に同時実行の確認を足した
- [ ] 日付・時刻に触ったなら、実際の Postgres につないで表示まで確かめた
- [ ] 主催者向けの手順が変わったなら `docs/` を直す
- [ ] 判断の理由が増えたなら `DESIGN.md` に書く
- [ ] **`main` から切ったブランチで作業し、push 後に未取込のコミットが無いか確かめた**

---

## やらないこと

- **マイグレーション CLI を導入しない。** スキーマは `schema-sql.ts` に
  「何度流しても同じ結果になる文」として足す
- **必須の環境変数を増やさない**（上記「この 3 つを壊さない」の 3 番）
- **蔵のパスワードを保存しない。** 発行直後の 1 回だけ見せる
- **役割をセッショントークンから読まない。** Clerk は既定で `publicMetadata` を
  トークンに含めない。DB を正とする
- **参加者がポイントを得る経路を増やさない。** いまは券のコードだけ。増やすと
  受付を通さず飲めてしまう
- **プロトタイプの文言を勝手に言い換えない。** 変えるなら理由を `DESIGN.md`
  §11 に書く

---

## 作業の進め方

1 つの依頼ごとに **`main` から新しくブランチを切る**。マージ済みのブランチに
あとから push すると、その分が取り残される（実際に 3 回起きた）。

push したら `git log origin/main..origin/<branch>` で未取込を確かめること。

---

## デザインの出典

画面の見た目と文言は claude.ai/design のプロジェクトから来ている。

- プロジェクト: `5914be51-2c0f-477b-bba0-44ed7afe1035`
- ファイル: `佐賀 蔵めぐり アプリ.dc.html`

デザインが更新されたら、`DESIGN.md` §7（画面一覧）§8（トークン）§11（変更点）を
突き合わせて差分を取る。`ios-frame.jsx` はモックアップ用の装飾なので**実装には
持ち込まない**。
