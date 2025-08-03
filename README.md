# BBC Golf Coaching - **Backend Option Pack (ver 2)**

> **本リポジトリは `bbc-golf-coaching-backend`（以下 *v1*）の拡張版です。**  
> ベース部分は v1 README を参照し、本書では **追加・変更点のみ** をまとめます。  
> https://github.com/showheysas/bbc-golf-coaching-backend#readme-ov-file

---

## 目次
1. [追加機能概要](#追加機能概要)  
2. [セットアップ差分](#セットアップ差分)  
3. [追加 API 一覧](#追加-api-一覧)  
4. [DB スキーマ差分](#db-スキーマ差分)  
5. [環境変数の追加](#環境変数の追加)  
6. [フロントエンド差分](#フロントエンド差分)  
7. [実装技術詳細](#実装技術詳細)  
   1. [音声文字起こしワークフロー](#音声文字起こしワークフロー)  
   2. [マークアップ（円・直線・折れ線）描画](#マークアップ円直線折れ線描画)  
   3. [マークアップ画像生成と保存](#マークアップ画像生成と保存)  
   4. [最新マークアップ画像の取得ロジック](#最新マークアップ画像の取得ロジック)  
8. [デプロイ／運用メモ](#デプロイ運用メモ)  
9. [セキュリティ＆ガバナンス](#セキュリティガバナンス)  

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

# 1) 依存パッケージ追加
pip install -r backend/requirements.txt  # ffmpeg-python, tenacity, fastapi-sse-starlette など

# 2) .env 追加例
OPENAI_API_KEY=...
AUDIO_CONTAINER_NAME=audio
DEFAULT_TIMEZONE=Asia/Tokyo
LOG_LEVEL=INFO

# 3) DB マイグレーション
cd backend
alembic upgrade head

## 追加 API 一覧

| HTTP   | パス                    | 概要                  | 主パラメータ                                        |
|--------|------------------------|----------------------|-----------------------------------------------------|
| POST   | `/transcribe-audio`    | 音声の文字起こし       | `audio(file)`, `type`, `video_filename?`, `phase_code?` |
| GET    | `/advices`             | テンプレ一覧取得       | –                                                   |
| POST   | `/advices`             | テンプレ追加           | `title`, `body`, `tags[]`                           |
| PUT    | `/advices/{id}`        | テンプレ更新           | 同上                                                |
| DELETE | `/advices/{id}`        | テンプレ削除           | –                                                   |
| POST   | `/markup-image`        | マークアップ画像保存   | `image(file)`, `payload(JSON)`                      |
| GET    | `/markups/latest`      | 最新50件取得          | `cursor?`                                           |

> **認証**：現状トークンレス（v2）。今後JWT/Role制御予定。

---

## DB スキーマ差分

| テーブル               | カラム/変更        | 型                           | 説明        |
|------------------------|-------------------|-----------------------------|-------------|
| coaching_reservation    | payment_status    | ENUM('pending','paid')       | 決済状況    |
| transcriptions          | 新規              | id, video_id?, path_on_blob, transcript, created_at | – |
| markup_images           | 新規              | id, video_id, section_id?, image_url, created_at    | – |

---

## 環境変数の追加

| 変数名                  | 用途                                |
|-------------------------|-------------------------------------|
| OPENAI_API_KEY          | Whisper / GPT 利用                   |
| AUDIO_CONTAINER_NAME    | 音声ファイル保存Blobコンテナ         |
| DEFAULT_TIMEZONE        | デフォルトタイムゾーン               |
| LOG_LEVEL               | ログ出力レベル(INFO, DEBUG等)        |

---

## フロントエンド差分

| 画面             | ルート                       | 概要                   |
|------------------|-----------------------------|------------------------|
| アドバイス一覧   | `/coach/advice`              | 検索＆一覧表示         |
| アドバイス追加   | `/coach/advice-new`          | 作成フォーム           |
| アドバイス編集   | `/coach/advice-edit?id=`     | 編集フォーム           |
| マークアップ一覧 | `/coach/markup-latest`       | サムネイル50件表示     |
| 音声確認         | `/player?audio=`             | 再生＆文字起こし表示   |

> **開発環境例**: Next.js 14 (Pages Router), Tailwind CSS v3, 共通API通信 `utils/fetcher.ts`

---

## 実装技術詳細

### 音声文字起こしワークフロー

| 手順 | 処理内容                         | 技術要素                       |
|------|----------------------------------|--------------------------------|
| 1    | 受信→バックグラウンド実行         | FastAPI `BackgroundTasks`      |
| 2    | ffmpegで16kHz/mono/WAVへ正規化   | `asyncio.create_subprocess_exec` |
| 3    | Whisper API呼び出し(5分ごと分割・リトライ)| `tenacity`, `whisper-1`      |
| 4    | GPT-4oで句読点・タイムスタンプ付与 | Chat Completions               |
| 5    | Blob保存＆DB挿入                  | Azure Blob SDK, SQLAlchemy     |
| 6    | JSON返却、またはSSE送信           | `fastapi-sse-starlette`        |

> **コスト参考**：10分×50本/月 ≒ 約¥6,000/月 (Whisper+GPT, 2025-08時点)

---

### マークアップ（円・直線・折れ線）描画

| 要素       | 採用           | ポイント                          |
|------------|----------------|-----------------------------------|
| Canvas     | React-Konva     | `<Stage>`, `<Layer>`で図形描画    |
| 状態管理   | Zustand         | `currentTool`をグローバル管理     |
| 円         | mousedownで中心記録、ドラッグで半径計算 |
| 直線       | p1→p2座標を渡す |
| 折れ線     | クリックで座標配列追加、ダブルクリックで確定 |
| スナップ   | Shiftで0°/90°制限 |

### Shape JSON例

```json
{
  "kind": "circle",
  "id": "abc123",
  "cx": 320,
  "cy": 180,
  "r": 45,
  "color": "#F87171"
}
```

### マークアップ画像生成・保存

1. **クライアント**  
   `stageRef.current.toDataURL({ pixelRatio: 2 })` でPNG生成  

2. **送信**  
   `multipart/form-data`形式でPNG＋JSON送信  

3. **サーバ**  
   `POST /markup-image`で受信→Blobへ保存  
   例: `videos/{video_id}/markup/{section_id}/{unix_ts}.png`  

4. **サムネイル**  
   Pillowで320px幅サムネ生成、`thumbnails/`に保存  

---

### 最新マークアップ画像 一覧取得SQL

```sql
SELECT mi.*
FROM markup_images mi
JOIN (SELECT video_id, MAX(created_at) AS latest
      FROM markup_images
      GROUP BY video_id) t
ON mi.video_id = t.video_id AND mi.created_at = t.latest
ORDER BY mi.created_at DESC
LIMIT 50;
```
- `created_at`にインデックス推奨  
- `GET /markups/latest?cursor=`でページング可能  

---

## デプロイ／運用メモ

- **Alembic必須**：本番DBへの適用を必ず実施  
- **Blob料金**：音声egress課金に注意  
- **Whisperコスト**：約USD 0.006/分（2025-08時点）  
- `/backend/data/advices`：読み取り専用マウントでも問題なし  
