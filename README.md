# BBC Golf Coaching - **Backend Option Pack (ver 2)**

> **本リポジトリは `bbc-golf-coaching-backend`（以下 *v1*）の拡張版です。**  
> ベース部分は v1 README を参照し、本書では **追加・変更点のみ** をまとめます。

---

## 目次
1. [追加機能概要](#追加機能概要)  
2. [セットアップ差分](#セットアップ差分)  
3. [追加 API 一覧](#追加-api-一覧)  
4. [DB スキーマ差分](#db-スキーマ差分)  
5. [環境変数の追加](#環境変数の追加)  
6. [フロントエンド差分](#フロントエンド差分)  
7. [実装技術詳細](#実装技術詳細)  
   1. [音声文字起こしワークフロー](#71-音声文字起こしワークフロー)  
   2. [マークアップ（円・直線・折れ線）描画](#72-マークアップ円直線折れ線描画)  
   3. [マークアップ画像生成と保存](#73-マークアップ画像生成と保存)  
   4. [最新マークアップ画像の取得ロジック](#74-最新マークアップ画像の取得ロジック)  
8. [デプロイ / 運用メモ](#デプロイ--運用メモ)  
9. [セキュリティ & ガバナンス](#セキュリティ--ガバナンス)  

---

## 追加機能概要

| 機能 | 説明 |
|------|------|
| **音声文字起こし API** | Whisper + GPT を使い、音声アップロード → テキスト化 → Blob 保存をワンストップ化 (`/transcribe-audio`) |
| **コーチアドバイス管理** | JSON テンプレート CRUD (`/advices` 系) と Next.js 画面 (`/coach/advice*`) |
| **動画マークアップ拡張** | 円・直線・折れ線ツール、スナップ/ガイド機能、PNG 書出し／アップロード |
| **最新マークアップ一覧** | 直近で作成・更新されたマークアップ画像 50 件をサムネイル表示 (`/coach/markup-latest`) |
| **決済フロー準備** | `coaching_reservation.payment_status (pending/paid)` 追加 ─ 将来の Stripe 連携を想定 |
| **Alembic 移行** | `alembic/` 同梱。差分を `alembic upgrade head` で自動適用 |
| **ユーティリティ** | 共通ロガー `utils/logger.py`、TZ 補正 `utils/timezone.py` |

---

## セットアップ差分

```bash
# 1) 依存追加
pip install -r backend/requirements.txt  # ffmpeg-python, tenacity, fastapi-sse-starlette などを含む

# 2) .env 差分例
OPENAI_API_KEY=...
AUDIO_CONTAINER_NAME=audio
DEFAULT_TIMEZONE=Asia/Tokyo
LOG_LEVEL=INFO

# 3) DB マイグレーション
cd backend
alembic upgrade head

## 追加 API 一覧

| HTTP | パス | 概要 | 主パラメータ |
|------|------|------|--------------|
| POST   | `/transcribe-audio` | 音声 → 文字起こし | `audio`(file), `type`, `video_filename?`, `phase_code?` |
| GET    | `/advices`          | テンプレ一覧       | – |
| POST   | `/advices`          | テンプレ追加       | `title`, `body`, `tags[]` |
| PUT    | `/advices/{id}`     | テンプレ更新       | 同上 |
| DELETE | `/advices/{id}`     | テンプレ削除       | – |
| POST   | `/markup-image`     | PNG + JSON 保存    | `image`(file), `payload`(JSON) |
| GET    | `/markups/latest`   | 最新 50 件取得     | `cursor?` |

> **認証**：v2 もトークンレス。将来 JWT / Role 制御を追加予定。

---

## DB スキーマ差分

| テーブル | 追加/変更列 | 型 | 説明 |
|----------|------------|----|------|
| `coaching_reservation` | `payment_status` | `ENUM('pending','paid')` | 決済状況 |
| `transcriptions`       | 新規 | `id`, `video_id?`, `path_on_blob`, `transcript`, `created_at` | – |
| `markup_images`        | 新規 | `id`, `video_id`, `section_id?`, `image_url`, `created_at` | – |

---

## 環境変数の追加

| 変数 | 用途 |
|------|------|
| `OPENAI_API_KEY` | Whisper / GPT 呼び出し |
| `AUDIO_CONTAINER_NAME` | 音声保存 Blob コンテナ名 |
| `DEFAULT_TIMEZONE` | 既定 `Asia/Tokyo` |
| `LOG_LEVEL` | `INFO` / `DEBUG` など |

---

## フロントエンド差分

| 画面 | ルート | 概要 |
|------|--------|------|
| アドバイス一覧       | `/coach/advice`          | 検索 + 一覧 |
| アドバイス追加       | `/coach/advice-new`      | 作成フォーム |
| アドバイス編集       | `/coach/advice-edit?id=` | 編集フォーム |
| マークアップ最新一覧 | `/coach/markup-latest`   | サムネイル 50 件 |
| 音声確認             | `/player?audio=`         | 再生 + 文字起こし表示 |

> **環境**：Next.js 14 / Pages Router、Tailwind CSS v3、API 通信は共通 `utils/fetcher.ts` に集約。

---

## 実装技術詳細

### 7.1 音声文字起こしワークフロー

| # | 処理 | 技術要素 |
|---|------|---------|
| 1 | 受信 ⇒ バックグラウンド処理へ | FastAPI `BackgroundTasks` |
| 2 | `ffmpeg` で 16 kHz/mono/WAV へ正規化 | `asyncio.create_subprocess_exec` |
| 3 | Whisper API 呼び出し (`whisper-1`) | `tenacity` でリトライ、5 分毎に切出し |
| 4 | GPT-4o で句読点・タイムスタンプ整形 | Chat Completions |
| 5 | Blob 保存 & `transcriptions` 挿入 | Azure Blob SDK, SQLAlchemy |
| 6 | 結果 JSON 返却 / SSE 送信 | `fastapi-sse-starlette` |

> **コスト例**：10 分 × 50 本 / 月 ≒ **約 ¥6,000 / 月**（Whisper + GPT）。

---

### 7.2 マークアップ（円・直線・折れ線）描画

| 要素 | 採用 | ポイント |
|------|------|----------|
| Canvas レイヤー | React-Konva | `<Stage>` / `<Layer>` で図形描画 |
| 状態管理 | Zustand | `currentTool` をグローバル保持 |
| 円 | `mousedown` → 中心記録、ドラッグで半径計算 |
| 直線 | `p1` → `p2` を `<Line>` に渡す |
| 折れ線 | クリックで `points[]` push、`dblclick` で確定 |
| スナップ | `Shift` で 0° / 90° 固定 |


### Shape JSON 例

```ts
{
  kind: 'circle',
  id: 'abc123',
  cx: 320, cy: 180, r: 45,
  color: '#F87171'
}
### 7.3 マークアップ画像生成と保存

1. **クライアント**  
   `stageRef.current.toDataURL({ pixelRatio: 2 })` → PNG を生成

2. **送信**  
   `multipart/form-data` で **PNG + `MarkupPayload` JSON** を送信

3. **サーバ処理**  
   `POST /markup-image` 受信 → Blob 保存  
   - 例）`videos/{video_id}/markup/{section_id}/{unix_ts}.png`

4. **サムネイル生成**  
   Pillow で 320 px 幅へ縮小し、`thumbnails/` へ再保存

---

### 7.4 最新マークアップ画像の取得ロジック

```sql
SELECT mi.*
FROM   markup_images mi
JOIN  (SELECT video_id, MAX(created_at) AS latest
       FROM   markup_images
       GROUP  BY video_id) t
  ON mi.video_id = t.video_id AND mi.created_at = t.latest
ORDER BY mi.created_at DESC
LIMIT 50;
- `created_at` インデックスで高速化  
- `GET /markups/latest?cursor=` でページング実装可能

---

## デプロイ / 運用メモ

1. **Alembic 必須**：本番 DB 反映を忘れずに  
2. **Blob 料金**：音声は動画より安いが egress 課金に注意  
3. **Whisper**: 約 **USD 0.006 / 分**（2025-08 時点）  
4. `backend/data/advices` は **読み取り専用マウント** でも OK  

---

## セキュリティ & ガバナンス

| 項目 | 実装 |
|------|------|
| XSS | `pydantic` による形・型バリデーション |
| 編集権限 | 将来の JWT 用に `check_owner(video_id)` スタブ済み |
| Blob 階層 | 動画 / 静止画 / 音声 を別コンテナ、SAS も分離 |
| 監査ログ | `actions_log(user_id, action, target_id, ts)` で API 操作を全件記録 |
