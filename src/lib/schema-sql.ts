/**
 * テーブル・関数の定義（SQL そのもの）。
 *
 * このファイルは **何も import しない**。理由は、検証スクリプト
 * (scripts/check-schema.mjs) が Next.js や Neon のドライバを通さずに
 * ここだけを読み込んで、本物の Postgres に流して確かめられるようにするため。
 * 適用の手順は schema.ts にある。
 *
 * ★ 各文は「何度流しても同じ結果になる」ことが絶対条件 ★
 * マイグレーション CLI を使わず、アプリが初回アクセス時に自動で流すため。
 * 主催者（非エンジニア）にコマンドを打たせない方針から来ている。
 */

/** 変更のたびに増やす。列の追加は必ず IF NOT EXISTS 付きで下に足す。 */
export const SCHEMA_VERSION = 1;

/** スキーマ適用の排他に使う助言ロックの番号。ほかの用途と衝突させない。 */
export const SCHEMA_LOCK_ID = 4200000001;

export const STATEMENTS: string[] = [
  // ── イベント設定。1 行しか持たない（id は常に 1）──
  `CREATE TABLE IF NOT EXISTS events (
     id                   integer PRIMARY KEY DEFAULT 1,
     name                 text        NOT NULL DEFAULT '佐賀 蔵めぐり',
     event_date           date        NOT NULL DEFAULT CURRENT_DATE,
     start_time           text        NOT NULL DEFAULT '11:00',
     end_time             text        NOT NULL DEFAULT '16:00',
     phase                text        NOT NULL DEFAULT 'auto',
     target_brewery_count integer     NOT NULL DEFAULT 30,
     updated_at           timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT events_single_row CHECK (id = 1),
     CONSTRAINT events_phase_valid CHECK (phase IN ('auto', 'before', 'open', 'closed'))
   )`,

  // ── 酒蔵 ──
  `CREATE TABLE IF NOT EXISTS breweries (
     id            text PRIMARY KEY,
     name          text        NOT NULL,
     area          text        NOT NULL DEFAULT '佐賀市',
     booth         text        NOT NULL DEFAULT '',
     accepting     boolean     NOT NULL DEFAULT true,
     login_id      text        NOT NULL UNIQUE,
     clerk_user_id text,
     sort_order    integer     NOT NULL DEFAULT 0,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS breweries_sort_idx ON breweries (sort_order, created_at)`,
  // 役割の判定で毎回引くので索引を張る。
  `CREATE INDEX IF NOT EXISTS breweries_clerk_user_idx
     ON breweries (clerk_user_id) WHERE clerk_user_id IS NOT NULL`,

  // ── 銘柄（蔵が持ち込むお酒）──
  `CREATE TABLE IF NOT EXISTS items (
     id              text PRIMARY KEY,
     brewery_id      text        NOT NULL REFERENCES breweries (id) ON DELETE CASCADE,
     name            text        NOT NULL,
     kind            text        NOT NULL DEFAULT '純米',
     polish          integer     NOT NULL DEFAULT 65,
     size            text        NOT NULL DEFAULT '四合瓶',
     cups_per_bottle integer     NOT NULL DEFAULT 6,
     bottles         integer     NOT NULL DEFAULT 0,
     used_cups       integer     NOT NULL DEFAULT 0,
     ticket_cost     integer     NOT NULL DEFAULT 1,
     description     text        NOT NULL DEFAULT '',
     richness        text        NOT NULL DEFAULT '',
     sweetness       text        NOT NULL DEFAULT '',
     accepting       boolean     NOT NULL DEFAULT true,
     created_at      timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT items_bottles_not_negative   CHECK (bottles   >= 0),
     CONSTRAINT items_used_cups_not_negative CHECK (used_cups >= 0),
     CONSTRAINT items_ticket_cost_range      CHECK (ticket_cost BETWEEN 1 AND 3)
   )`,
  `CREATE INDEX IF NOT EXISTS items_brewery_idx ON items (brewery_id, created_at)`,

  // ── 券種（前売券・当日券）──
  `CREATE TABLE IF NOT EXISTS ticket_batches (
     id              text PRIMARY KEY,
     label           text    NOT NULL,
     code            text    NOT NULL,
     can_add         boolean NOT NULL DEFAULT true,
     cups_per_ticket integer NOT NULL DEFAULT 10,
     note            text    NOT NULL DEFAULT '',
     sort_order      integer NOT NULL DEFAULT 0,
     CONSTRAINT ticket_batches_cups_positive CHECK (cups_per_ticket > 0)
   )`,

  // ── 個々のチケット QR。1 行 = 紙 1 枚。
  //    「同じ券は二度使えない」を守るため、券ごとに行を持って消し込む。──
  `CREATE TABLE IF NOT EXISTS tickets (
     code        text PRIMARY KEY,
     batch_id    text        NOT NULL REFERENCES ticket_batches (id) ON DELETE CASCADE,
     redeemed_by text,
     redeemed_at timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS tickets_batch_idx ON tickets (batch_id)`,
  // 未読取の券だけを速く数える／取り出すための部分インデックス
  `CREATE INDEX IF NOT EXISTS tickets_unredeemed_idx
     ON tickets (batch_id) WHERE redeemed_by IS NULL`,

  // ── 参加者 ──
  // 参加者番号はシーケンスで振る。件数を数えて +1 すると同時登録でぶつかる。
  `CREATE SEQUENCE IF NOT EXISTS guest_no_seq START 10001`,
  `CREATE TABLE IF NOT EXISTS guests (
     clerk_user_id text PRIMARY KEY,
     display_no    text        NOT NULL DEFAULT ('参加者 #' || nextval('guest_no_seq')),
     kind          text        NOT NULL DEFAULT '一般参加',
     tickets       integer     NOT NULL DEFAULT 0,
     used          integer     NOT NULL DEFAULT 0,
     created_at    timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT guests_tickets_not_negative CHECK (tickets >= 0),
     CONSTRAINT guests_used_not_negative    CHECK (used    >= 0)
   )`,

  // ── 注文 ──
  `CREATE TABLE IF NOT EXISTS requests (
     id             bigserial PRIMARY KEY,
     guest_clerk_id text        NOT NULL,
     guest_label    text        NOT NULL,
     brewery_id     text        NOT NULL REFERENCES breweries (id) ON DELETE CASCADE,
     item_id        text        NOT NULL REFERENCES items (id) ON DELETE CASCADE,
     brand          text        NOT NULL,
     cups           integer     NOT NULL,
     ticket_cost    integer     NOT NULL,
     status         text        NOT NULL DEFAULT 'accepted',
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_at     timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT requests_cups_positive CHECK (cups > 0),
     CONSTRAINT requests_status_valid
       CHECK (status IN ('accepted', 'preparing', 'ready', 'delivered', 'cancelled'))
   )`,
  `CREATE INDEX IF NOT EXISTS requests_brewery_idx ON requests (brewery_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS requests_guest_idx   ON requests (guest_clerk_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS requests_open_idx
     ON requests (brewery_id) WHERE status IN ('accepted', 'preparing')`,

  // ── 主催者。だれが運営できるかの名簿 ──
  `CREATE TABLE IF NOT EXISTS organizers (
     clerk_user_id text PRIMARY KEY,
     email         text        NOT NULL DEFAULT '',
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,

  // ── 注文を通す処理。
  //
  //    ★ なぜ関数にしているか ★
  //    「残りを確かめて、チケットを引いて、注文を作る」は途中で割り込まれては
  //    ならない。Neon の HTTP ドライバは条件分岐のあるトランザクションを張れず、
  //    CTE を並べる書き方では次の 2 つが防げなかった:
  //      1. 同じ最後の 1 杯を 2 人が同時に取れてしまう
  //         （CTE はすべて文の開始時点のスナップショットを見るため、
  //           あとから確定した他人の注文が見えない）
  //      2. チケットだけ引かれて注文が作られない、の片落ち
  //    そこで関数の中で「銘柄の行を FOR UPDATE でロック → そのあとの文で
  //    最新の注文状況を数える」という順番にしている。READ COMMITTED では
  //    文ごとに新しいスナップショットを取るので、ロック取得後の集計は最新になる。
  //
  //    失敗しても例外にせず、理由を文字列で返す。そのまま画面に出せるようにするため。
  `CREATE OR REPLACE FUNCTION place_order(p_user text, p_item text, p_cups integer)
   RETURNS TABLE (ok boolean, reason text, request_id bigint, spent integer)
   LANGUAGE plpgsql AS $fn$
   DECLARE
     v_item      items;
     v_accepting boolean;
     v_pending   integer;
     v_available integer;
     v_spend     integer;
     v_tickets   integer;
     v_label     text;
     v_id        bigint;
   BEGIN
     -- 銘柄の行をロック。ここから先を通れるのは一度に 1 本だけ。
     SELECT * INTO v_item FROM items WHERE id = p_item FOR UPDATE;
     IF NOT FOUND THEN
       RETURN QUERY SELECT false, 'その銘柄は見つかりませんでした。画面を更新してください。'::text,
                           NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     -- COALESCE で包むのは、万一蔵の行が見つからなかったとき
     -- v_accepting が NULL になり、IF NOT NULL が偽として素通りしてしまうため。
     SELECT COALESCE(accepting, false) INTO v_accepting
       FROM breweries WHERE id = v_item.brewery_id;
     IF NOT COALESCE(v_accepting, false) THEN
       RETURN QUERY SELECT false, 'この蔵は現在 受付を停止しています。'::text,
                           NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     -- 銘柄ごとの受付停止（Issue #43）。最初に銘柄の行をロックして読んだ値なので、
     -- 蔵が止めた直後に押されても、止めたあとの値で判断できる。
     IF NOT v_item.accepting THEN
       RETURN QUERY SELECT false, 'この銘柄はいま受付を停止しています。ほかの銘柄をお選びください。'::text,
                           NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     -- まだ渡し終えていない注文が押さえている杯数。
     -- ロックを取ったあとの文なので、他の人の確定した注文もここで見える。
     SELECT COALESCE(sum(cups), 0) INTO v_pending
       FROM requests
      WHERE item_id = p_item AND status IN ('accepted', 'preparing', 'ready');

     v_available := v_item.bottles * v_item.cups_per_bottle - v_item.used_cups - v_pending;
     IF v_available < p_cups THEN
       RETURN QUERY SELECT false,
         CASE WHEN v_available <= 0
           THEN 'ちょうど注文が埋まりました。ほかの銘柄をお選びください。'
           ELSE format('いま頼めるのは残り %s 杯です。杯数を減らしてください。', v_available)
         END::text, NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     v_spend := v_item.ticket_cost * p_cups;

     -- 参加者の行もロックしてから残高を見る。別の端末との同時注文で
     -- 残高が二重に使われるのを防ぐ。ロックの順番は常に 銘柄 → 参加者。
     SELECT tickets, display_no INTO v_tickets, v_label
       FROM guests WHERE clerk_user_id = p_user FOR UPDATE;
     IF NOT FOUND THEN
       RETURN QUERY SELECT false, 'ポイントの残高が見つかりません。画面を更新してください。'::text,
                           NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     -- まだ受け取っていない注文があれば、次は出させない（Issue #34）。
     -- 参加者の行をロックしたあとで確かめるのが要。2 台の端末から同時に
     -- 押されても、2 本目はロックが空くのを待ち、そのあとの文で 1 本目の
     -- 注文が見えるので、ここで止まる。domain.ts の UNDELIVERED_STATUSES と同じ。
     IF EXISTS (
       SELECT 1 FROM requests
        WHERE guest_clerk_id = p_user AND status IN ('accepted', 'preparing', 'ready')
     ) THEN
       RETURN QUERY SELECT false,
         'まだ受け取っていないリクエストがあります。受け取ってから次をお選びください。'::text,
         NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     IF v_tickets < v_spend THEN
       RETURN QUERY SELECT false,
         format('ポイントが %s 足りません。', v_spend - v_tickets)::text,
         NULL::bigint, NULL::integer;
       RETURN;
     END IF;

     UPDATE guests SET tickets = tickets - v_spend, used = used + v_spend
      WHERE clerk_user_id = p_user;

     INSERT INTO requests
       (guest_clerk_id, guest_label, brewery_id, item_id, brand, cups, ticket_cost, status)
     VALUES (p_user, v_label, v_item.brewery_id, p_item, v_item.name, p_cups, v_spend, 'accepted')
     RETURNING id INTO v_id;

     RETURN QUERY SELECT true, NULL::text, v_id, v_spend;
   END;
   $fn$`,

  // ── 問い合わせ。蔵・参加者 → 主催者の一問一答。
  //    やり取りが続く前提にしない。会場で長い会話はできないので、
  //    1 つの問いに 1 つの答えを返して終わりにする。──
  `CREATE TABLE IF NOT EXISTS inquiries (
     id             bigserial PRIMARY KEY,
     from_clerk_id  text        NOT NULL,
     from_role      text        NOT NULL,
     from_label     text        NOT NULL,
     brewery_id     text        REFERENCES breweries (id) ON DELETE SET NULL,
     subject        text        NOT NULL DEFAULT '',
     body           text        NOT NULL,
     answer         text,
     answered_at    timestamptz,
     created_at     timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT inquiries_role_valid CHECK (from_role IN ('brewery', 'guest')),
     CONSTRAINT inquiries_body_not_empty CHECK (length(btrim(body)) > 0)
   )`,
  // 未回答を先に出すので、その順で引けるようにする。
  `CREATE INDEX IF NOT EXISTS inquiries_open_idx
     ON inquiries ((answer IS NULL) DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS inquiries_from_idx
     ON inquiries (from_clerk_id, created_at DESC)`,

  // ── お知らせの宛先。端末ごとに 1 行。──
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     endpoint      text PRIMARY KEY,
     clerk_user_id text        NOT NULL,
     role          text        NOT NULL DEFAULT 'guest',
     p256dh        text        NOT NULL,
     auth          text        NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now(),
     failed_at     timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
     ON push_subscriptions (clerk_user_id)`,

  // ── 送り終えた節目の記録。
  //    同じ節目を二度 送らないための鍵。開催日ごとに 1 回だけ。──
  `CREATE TABLE IF NOT EXISTS sent_notices (
     event_date date NOT NULL,
     milestone  text NOT NULL,
     sent_at    timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (event_date, milestone)
   )`,

  // ── お知らせの履歴。右上の 🔔 から見返せるようにする。
  //    OS の通知は一度消すと見返せず、iPhone はホーム画面に追加しないと届きも
  //    しない。届いたかどうかに関係なく、アプリの中に残しておく。
  //    clerk_user_id が NULL のものは全員あて（開始 10 分前などの節目）。──
  `CREATE TABLE IF NOT EXISTS notices (
     id            bigserial PRIMARY KEY,
     clerk_user_id text,
     kind          text        NOT NULL,
     title         text        NOT NULL,
     body          text        NOT NULL,
     url           text        NOT NULL DEFAULT '/',
     audience      text        NOT NULL DEFAULT 'all',
     created_at    timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT notices_kind_valid CHECK (kind IN ('milestone', 'ready', 'message', 'delivered'))
   )`,
  `CREATE INDEX IF NOT EXISTS notices_user_idx ON notices (clerk_user_id, created_at DESC)`,
  // 読んだ記録。1 人 1 件に 1 行。全員あてのお知らせも、読んだかどうかは人ごとに違う。
  `CREATE TABLE IF NOT EXISTS notice_reads (
     notice_id     bigint      NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
     clerk_user_id text        NOT NULL,
     read_at       timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (notice_id, clerk_user_id)
   )`,

  // ── 利用規約・プライバシーポリシーへの同意（Issue #64）。
  //    版ごとに 1 人 1 行。本文を改めて版を上げると、新しい版への同意が無いので、
  //    もう一度聞く。端末の中に覚えるだけだと、消えたときに何度も聞かれるうえ、
  //    同意を得た記録にもならないので、ここに残す。
  //    「前回の記録を片付ける」でも消さない（イベントではなくアカウントに結びつくため）。──
  `CREATE TABLE IF NOT EXISTS consents (
     clerk_user_id text        NOT NULL,
     version       text        NOT NULL,
     agreed_at     timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (clerk_user_id, version)
   )`,

  // ── 内部メモ（スキーマ版数など）──
  `CREATE TABLE IF NOT EXISTS app_meta (
     key   text PRIMARY KEY,
     value text NOT NULL
   )`,
];

/** 初回だけ入れる行。すでにあれば何もしない。 */
export const SEED_STATEMENTS: string[] = [
  `INSERT INTO events (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  `INSERT INTO ticket_batches (id, label, code, can_add, cups_per_ticket, note, sort_order)
   VALUES
     ('advance',  '前売券', 'SAGA-ADV', true, 10, '事前に販売する券', 0),
     ('same-day', '当日券', 'SAGA-DAY', true, 10, '会場で販売する券', 1)
   ON CONFLICT (id) DO NOTHING`,

  // 主催者からの配信（Issue #54）と、受渡完了のお知らせ（Issue #66）を足した分の移行。
  // audience は、宛先が空（全員あて）のお知らせを「誰に見せるか」。
  //   all: 主催者も含む全員（節目のお知らせ）
  //   brewery / guest: 全酒蔵 / 全参加者
  //   brewery+guest: 酒蔵と参加者の両方（送った主催者には出さない）
  // 既存のお知らせ（節目・準備完了）は all のまま。
  `ALTER TABLE notices ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all'`,
  `ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_audience_valid`,
  `ALTER TABLE notices ADD CONSTRAINT notices_audience_valid
     CHECK (audience IN ('all', 'brewery', 'guest', 'brewery+guest'))`,
  `ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_kind_valid`,
  `ALTER TABLE notices ADD CONSTRAINT notices_kind_valid
     CHECK (kind IN ('milestone', 'ready', 'message', 'delivered'))`,

  // 銘柄の説明文（Issue #40）を足した分の移行。すでにある表に列を足す。
  // 長さは domain.ts の MAX_ITEM_DESCRIPTION と同じ。char_length は日本語 1 文字を
  // 1 文字と数えるので、画面の数え方（Array.from）とそろう。
  `ALTER TABLE items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''`,
  `ALTER TABLE items DROP CONSTRAINT IF EXISTS items_description_length`,
  `ALTER TABLE items ADD CONSTRAINT items_description_length
     CHECK (char_length(description) <= 200)`,
  // 味わいの型（濃淡・甘辛）。どちらも任意なので空文字を許す。
  // 選べる値は domain.ts の SAKE_RICHNESS / SAKE_SWEETNESS と同じ。
  `ALTER TABLE items ADD COLUMN IF NOT EXISTS richness text NOT NULL DEFAULT ''`,
  `ALTER TABLE items ADD COLUMN IF NOT EXISTS sweetness text NOT NULL DEFAULT ''`,
  `ALTER TABLE items DROP CONSTRAINT IF EXISTS items_richness_valid`,
  `ALTER TABLE items ADD CONSTRAINT items_richness_valid
     CHECK (richness IN ('', '淡麗', '濃醇'))`,
  `ALTER TABLE items DROP CONSTRAINT IF EXISTS items_sweetness_valid`,
  `ALTER TABLE items ADD CONSTRAINT items_sweetness_valid
     CHECK (sweetness IN ('', '大甘口', '甘口', '普通', '辛口', '大辛口'))`,

  // 取りに来ていない参加者への催促（Issue #73）を足した分の移行。
  // 最後に催促した時刻。連打で何度も鳴らさないよう、間隔の判定に使う。
  `ALTER TABLE requests ADD COLUMN IF NOT EXISTS reminded_at timestamptz`,

  // 銘柄ごとの受付停止（Issue #43）を足した分の移行。既存の銘柄は受付中のまま。
  `ALTER TABLE items ADD COLUMN IF NOT EXISTS accepting boolean NOT NULL DEFAULT true`,

  // 1 杯あたりのチケット枚数の上限を広げた分の移行。
  // 銘柄の値付けは蔵が決めるので、3 枚までという決め打ちをやめた。
  `ALTER TABLE items DROP CONSTRAINT IF EXISTS items_ticket_cost_range`,
  `ALTER TABLE items ADD CONSTRAINT items_ticket_cost_range
     CHECK (ticket_cost BETWEEN 1 AND 20)`,

  // 受付の開け閉めを「予定どおり（auto）」を既定に変えた分の移行。
  // 既存の表には古い CHECK と DEFAULT が残っているので、貼り替える。
  `ALTER TABLE events ALTER COLUMN phase SET DEFAULT 'auto'`,
  `ALTER TABLE events DROP CONSTRAINT IF EXISTS events_phase_valid`,
  `ALTER TABLE events ADD CONSTRAINT events_phase_valid
     CHECK (phase IN ('auto', 'before', 'open', 'closed'))`,
  `UPDATE events SET phase = 'auto' WHERE phase = 'before'`,

  // 券種名から「10枚」を外す。枚数は主催者が画面で決められるようになったので、
  // 名前に焼き込むと実際の設定と食い違う。すでに直っていれば何もしない。
  `UPDATE ticket_batches SET label = '前売券' WHERE id = 'advance'  AND label LIKE '前売券%'  AND label <> '前売券'`,
  `UPDATE ticket_batches SET label = '当日券' WHERE id = 'same-day' AND label LIKE '当日券%' AND label <> '当日券'`,
  // 前売券も会場で追加発行できるようにする（初期データの名残を解消）。
  `UPDATE ticket_batches SET can_add = true WHERE can_add = false`,
];
