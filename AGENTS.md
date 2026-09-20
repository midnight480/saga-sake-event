# AGENTS.md — このリポジトリで作業する人／エージェントへ

佐賀の酒蔵が集まる合同試飲イベントの運営 Web サービス。
**主催者 / 酒蔵 / 参加者** の 3 者が同じデータを見て動く。

設計の背景・判断の理由は [`DESIGN.md`](DESIGN.md) にある。**変更を加える前に
必ず読むこと。** ここに書いてあるのは「どう作業するか」だけ。

---

## この 2 つを壊さない

作業中に迷ったら、次の 2 つを優先する。ほかのきれいさは後回しでいい。

### 1. 環境変数が無くても、ビルドと起動が成功すること

主催者（非エンジニア）は **まず何も設定せずにデプロイし、そのあと Vercel の
画面で Neon と Clerk を追加する**。もし環境変数が無い状態でアプリが落ちると、
案内すべき `/setup` すら開けず、主催者は真っ白なエラー画面の前で詰む。

守るために:

- モジュールのトップレベルで DB に接続しない（`getSql()` は使う瞬間に呼ぶ）
- `middleware.ts` / `layout.tsx` は Clerk の鍵が無ければ Clerk を通さない
- `/setup` は DB も Clerk も使わずに描画できる状態を保つ
- 設定を見るページには `export const dynamic = 'force-dynamic'` を付ける
  （静的に固めると、あとから環境変数を足しても「未設定」が焼き付く）

**確認方法**: `.env.local` を一時的に空にして `npm run build && npm start`。
`/` が `/setup` に飛び、`/setup` が読めること。

### 2. 在庫とチケットが二重に動かないこと

当日は同じ在庫を複数の端末が同時に触る。二重に減る／戻ると、その場で誰も
原因を突き止められない。

**「読んで、考えて、書く」を別々の SQL に分けてはいけない。**
条件を `WHERE` に入れた 1 本の SQL（CTE 付き UPDATE）で書き、
0 行返ってきたら失敗と判断する。既存の実装をそのまま真似ること:

- `redeemTicket` … 券の消し込み＋加算
- `createRequest` … 残高確認＋在庫確認＋引き落とし＋注文作成
- `setRequestStatus` … 状態遷移＋在庫減／チケット返却

---

## ファイルの地図

```
src/
  lib/
    domain.ts      型と計算式。DB もネットワークも触らない純粋な関数だけ
    schema.ts      テーブル定義と自動適用（ensureSchema）
    db.ts          Neon 接続。使う瞬間まで接続を遅らせる
    store.ts       DB の読み書き。外に出るのは domain.ts の型だけ
    auth.ts        役割（主催者/酒蔵/参加者）の判定と番人
    setup-state.ts /setup の診断
    useSnapshot.ts 会場の現在値を 4 秒ごとに購読するフック
  components/
    ui.tsx         画面部品。色と余白はここに閉じ込める
    AppShell.tsx   3 役割共通の外枠（ヘッダ・下タブ）
    clerkAppearance.ts  Clerk 標準画面の配色
  app/
    actions.ts     画面から呼ぶ操作。権限確認はすべてここ
    api/snapshot/  会場の現在値を返す口（ポーリング先）
    setup/         セットアップ診断
    organizer/     主催者（layout で権限確認、shell で外枠）
    brewery/       酒蔵
    guest/         参加者
docs/              主催者向けの日本語手順書
```

### 依存の向き

```
app/(画面)  →  components/  →  lib/domain.ts
     ↓
app/actions.ts  →  lib/auth.ts  →  lib/store.ts  →  lib/schema.ts  →  lib/db.ts
                                        ↓
                                  lib/domain.ts
```

**`lib/domain.ts` は何にも依存しない。** ここに DB や Clerk を import したら
設計が崩れている合図。

---

## コマンド

```bash
npm run dev         # 開発サーバー
npm run build       # 本番ビルド（環境変数なしでも通ること）
npm run typecheck   # 型検査。ビルドは型で落とさないので、ここで必ず確認する
```

`next.config.ts` で `typescript.ignoreBuildErrors = true` にしているのは、
主催者が GitHub 上で直接ファイルを編集したときに誤字ひとつで当日の
デプロイが止まるのを避けるため。**開発では `npm run typecheck` を必ず通す。**

### ローカルで動かす

`.env.example` を `.env.local` にコピーして `DATABASE_URL` と Clerk の鍵を入れる。
`DATABASE_URL` は Neon の無料プロジェクトを 1 つ作れば足りる。

### SQL を実際の Postgres で検証する

**SQL を触ったら必ず走らせる。** CI でも毎回走る。

```bash
# 適当な Postgres を用意して（docker でも embedded-postgres でもよい）
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=x PGDATABASE=saga \
  npm run verify:sql
```

`scripts/check-schema.mjs` が確かめること:

- スキーマを **2 回**流して壊れない（初回アクセス時に自動適用するため）
- `store.ts` などの中の SQL 全件を `PREPARE` に通し、**存在しない列・表**を検出
  （実行しないので副作用なし）
- `place_order` の挙動と、**同時注文で売り過ぎないこと**
- **同じ券を同時に読んでも 1 回しか加算されないこと**
- 受渡・キャンセルで数字が二重に動かないこと

SQL は `src/lib/schema-sql.ts`（import を持たないので、この検証スクリプトから
直接読める）にある。**出典を 1 か所にするため、スクリプト側に SQL を書き写さない。**

### Neon なしでアプリ全体を動かす

Neon のドライバは Neon の HTTP 口とだけ話すので、ローカルの Postgres には
そのままつながらない。同じ形式を話す中継を立てて `NEON_FETCH_ENDPOINT` を
指すと、Neon のアカウントなしで全体を通せる（`db.ts` 参照。本番ではこの
環境変数を設定しないので経路は変わらない）。

中継は Neon の SQL-over-HTTP を実装すればよい:
`POST` で `{query, params}`（バッチは `{queries:[…]}` → `{results:[…]}`）を受け、
`Neon-Raw-Text-Output` に合わせて**値を文字列のまま**返し、`fields[].dataTypeID`
を添える（型変換はドライバ側が行う）。

**この経路で実際に不具合が 1 件見つかっている**（開催日が 1 日ずれる）。
日付・時刻に触る変更をしたら、ここまで通して確かめること。

---

## 書き方の決まり

### コメントは日本語で、「なぜ」を書く

このリポジトリは日本語で運用する。コードが何をしているかは読めば分かるので、
**なぜそうしたか**、特に「素直に書くとこうなるが、こういう事情でこうした」を
書く。既存のコメントの密度と文体に合わせること。

### 色・余白を画面に直書きしない

`src/app/globals.css` の `@theme` にトークンを定義し、Tailwind のクラス
（`bg-card` `text-gold` `border-hairline`）で参照する。
新しい色が必要になったら、まずトークンを増やす。

### 計算は `domain.ts` に集める

杯数・チケット・混雑の判定を画面で計算しない。サーバーとブラウザで同じ式を
使うことで「画面ごとに数が違う」を防いでいる。

### 触る部品は 44px 以上

スマホの実機で確実に押せる高さを保つ。`components/ui.tsx` の `Button` は
`min-h-12`（48px）が既定。新しい操作部品もこれに合わせる。

### iOS / Android の両方で動かす

片方でしか動かない API を使わない。迷ったら `DESIGN.md` §1 の表を見る。
特に:

- 入力欄の `font-size` を 16px 未満にしない
- `<video>` に `playsInline` を必ず付ける
- 画面下端の余白は `env(safe-area-inset-bottom)` を使う

### 失敗を日本語で返す

操作の戻り値は `{ ok: true }` / `{ ok: false, reason: '…' }` にそろえる。
`reason` は**そのまま画面に出せる日本語**にする。当日、主催者や蔵の担当者が
自力で立て直せるかはこの文言で決まる。「エラーが発生しました」は書かない。

---

## 変更したら確認すること

- [ ] `npm run typecheck` が通る
- [ ] `npm run build` が **環境変数なしで** 通る
- [ ] `.env.local` を空にして `/setup` が開く
- [ ] SQL を触ったなら `npm run verify:sql` が通る
- [ ] 在庫・チケットに関わる変更なら、`check-schema.mjs` に同時実行の確認を足した
- [ ] 日付・時刻に触ったなら、実際の Postgres につないで表示まで確かめた
- [ ] 主催者向けの手順が変わったなら `docs/デプロイ手順.md` を直す
- [ ] 判断の理由が増えたなら `DESIGN.md` に書く

---

## やらないこと

- **マイグレーション CLI を導入しない。** 主催者にコマンドを打たせない方針。
  スキーマは `schema.ts` に `CREATE ... IF NOT EXISTS` で足す。
- **必須の環境変数を増やさない。** 増やすと主催者の手順が増える。
  どうしても必要なら `/setup` の診断項目も同時に追加すること。
- **蔵のパスワードを保存しない。** 発行直後の 1 回だけ見せる。理由は
  `DESIGN.md` §9 / §10。
- **プロトタイプの文言を勝手に言い換えない。** `DESIGN.md` 冒頭のリンク先が
  文言の出典。変えるなら理由を `DESIGN.md` §9 に書く。

---

## デザインの出典

画面の見た目と文言は claude.ai/design のプロジェクトから来ている。

- プロジェクト: `5914be51-2c0f-477b-bba0-44ed7afe1035`
- ファイル: `佐賀 蔵めぐり アプリ.dc.html`

デザインが更新されたら、`DESIGN.md` §5（画面一覧）§6（トークン）§9（変更点）を
突き合わせて差分を取る。`ios-frame.jsx` はモックアップ用の装飾なので**実装には
持ち込まない**（理由は `DESIGN.md` §9）。
