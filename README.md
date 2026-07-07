# PAST Task Manager

Wrike を参考にしたタスク管理ウェブアプリです。プロジェクト／タスク（チケット）をチームで管理し、カンバンとリストで可視化します。

## 主な機能

- **Google ログイン**（Auth.js / NextAuth v5）
- **プロジェクト管理**：作成・一覧、メンバーをメールアドレスで招待
- **タスク管理**：タイトル・内容・**工数（見積／実績）**・**担当者**・**ステータス**・期限
- **サブタスク**：チェックで完了切り替え
- **コメント**
- **ファイル添付**（Vercel Blob）
- **カンバン表示**：列はステータス（未着手 / 進行中 / レビュー / 完了）。**ドラッグ&ドロップ**でステータス変更・並べ替え（dnd-kit）
- **リスト表示**：ステータス・担当をその場で変更

> 今回は「動く土台」を優先しています。**人ごとのスケジュールビュー**と**プロジェクト全体のガントビュー**（どちらもドラッグ操作）は次フェーズで追加する想定です。データモデルには `startDate` / `dueDate` を用意済みなので、そのまま拡張できます。

## 技術構成

| 領域 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 15（App Router）+ TypeScript |
| スタイル | Tailwind CSS v4 |
| DB | PostgreSQL（Vercel / Neon 無料枠） |
| ORM | Prisma |
| 認証 | Auth.js (NextAuth v5) + Google OAuth |
| ファイル保存 | Vercel Blob |
| ドラッグ&ドロップ | dnd-kit |

---

## セットアップ手順

### 0. 前提

Node.js 20 以上、GitHub アカウント、Vercel アカウント、Google アカウント。

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数

`.env.example` をコピーして `.env` を作成し、各値を設定します。

```bash
cp .env.example .env
```

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | Neon Postgres 接続文字列（プール経由） |
| `DIRECT_URL` | マイグレーション用の直接接続（Neon の `DATABASE_URL_UNPOOLED`） |
| `AUTH_SECRET` | セッション署名用の秘密鍵。`npx auth secret` か `openssl rand -base64 32` で生成 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth クライアント |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob のトークン |

### 3. DB（Neon Postgres）

Vercel ダッシュボード → **Storage** → **Create Database** → **Neon（Postgres）** を選択（無料枠）。作成すると `DATABASE_URL` 等が自動で表示されます。ローカルでは `.env` に貼り付けてください（Vercel 連携時は本番環境に自動注入されます）。

スキーマを反映：

```bash
npx prisma db push
```

> 本番運用でマイグレーション履歴を残したい場合は `npx prisma migrate dev` を利用してください。

### 4. Google OAuth（無料）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **APIとサービス → OAuth 同意画面** を設定（外部／テストユーザーに自分を追加）
3. **認証情報 → 認証情報を作成 → OAuth クライアント ID → ウェブアプリケーション**
4. **承認済みのリダイレクト URI** に以下を登録：
   - ローカル：`http://localhost:3000/api/auth/callback/google`
   - 本番：`https://<your-app>.vercel.app/api/auth/callback/google`
5. 表示された **クライアント ID / シークレット** を `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` に設定

> Google のログイン認証（OAuth）自体に料金はかかりません。

### 5. Vercel Blob（ファイル添付）

Vercel ダッシュボード → **Storage** → **Create → Blob**。作成すると `BLOB_READ_WRITE_TOKEN` が発行され、プロジェクトに自動で紐づきます。ローカルで試す場合は `.env` にトークンを設定してください。

### 6. ローカル起動

```bash
npm run dev
```

http://localhost:3000 を開く → Google でログイン → プロジェクトを作成。

---

## Vercel へのデプロイ

1. このリポジトリを GitHub に push（`origin` は設定済み）

   ```bash
   git add -A
   git commit -m "PAST Task Manager 初期実装"
   git push origin main
   ```

2. Vercel で **Add New → Project** から該当リポジトリを Import
3. **Storage** タブで上記の Neon Postgres と Blob を作成・接続（環境変数が自動注入されます）
4. **Settings → Environment Variables** に以下を追加：
   - `AUTH_SECRET`
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - （`DATABASE_URL` / `DIRECT_URL` / `BLOB_READ_WRITE_TOKEN` は Storage 連携で自動設定）
5. 初回デプロイ後、一度だけスキーマを反映：

   ```bash
   # ローカルから本番 DB に対して
   npx prisma db push
   ```

   もしくは `build` スクリプトに `prisma db push` を追加して自動化することも可能です（破壊的変更に注意）。

6. Google OAuth のリダイレクト URI に本番 URL を追加（手順4-4）

ビルドコマンドは `package.json` の `build`（`prisma generate && next build`）が使われます。

---

## ディレクトリ構成

```
src/
  app/
    (app)/                 # ログイン必須エリア（共通ヘッダー）
      projects/            # 一覧・詳細（カンバン/リスト）
    api/                   # REST API ルート
    login/                 # ログイン画面
  components/              # 画面パーツ（カンバン・リスト・タスク詳細 等）
  lib/                     # prisma クライアント・認可ヘルパー・定数・型
  auth.ts / auth.config.ts # NextAuth 設定（Node 用 / Edge 用に分割）
  middleware.ts            # 未ログインを /login へ
prisma/schema.prisma       # データモデル
```

## 補足・既知の制限

- ファイル添付はサーバー経由アップロードのため、Vercel の関数ボディ上限（約 4.5MB）が実質の上限です。大きなファイルを扱う場合は Vercel Blob の**クライアントアップロード**方式に切り替えてください。
- 認可は「プロジェクトのメンバーか」で判定するシンプルな実装です。役割（OWNER/MEMBER）による細かい権限分けは最小限です。
- メンバー招待は、相手が**一度ログイン済み**（User レコードが存在）であることが前提です。未登録者へのメール招待フローは未実装です。

## 次フェーズ候補

- 人別スケジュールビュー（担当者×日付の帯をドラッグで期間変更）
- ガントチャート（タスクのバーをドラッグで開始/期限変更、依存線）
- 通知・アクティビティログ、検索/フィルタ
