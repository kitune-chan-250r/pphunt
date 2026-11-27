# React + TypeScript + Vite

## Terraform

devcontainer には Terraform CLI 1.9.8 と HashiCorp Terraform for VS Code
拡張機能がインストールされます。設定を取得した後に devcontainer を再ビルドし、
次のコマンドで Terraform が使えることを確認してください。

```bash
terraform version
```

Terraform は Direct Upload 方式の Cloudflare Pages プロジェクトを作成し、
`pphunt.rakas.cc` から `pphunt.pages.dev` へのプロキシ有効な DNS CNAME レコードを
登録して、カスタムドメインをプロジェクトに関連付けます。Jenkins はビルドと
テストの成功後、`main` ブランチの `dist/` を本番環境にデプロイします。
Cloudflare の GitHub ビルド連携は使用しません。

ScoreSaber API はブラウザーから直接呼び出さず、Pages Functions の
`/api/scoresaber/*` 経由でアクセスします。Function の実装はリポジトリ直下の
`functions/` に置き、Jenkins と同様にリポジトリルートから `wrangler pages deploy
dist` を実行してデプロイしてください。Terraform は Pages Functions の互換性日を
production / preview の両環境に設定します。Vite の開発サーバーにも同じパスの
開発用プロキシを設定しています。

Cloudflare API トークンを `.env` に `CLOUDFLARE_API_TOKEN` として設定してください。
Terraform は `.env` を自動では読み込みません。Cloudflare Provider は
シェルから export された `CLOUDFLARE_API_TOKEN` を自動的に読み込みます。
Dev Container は起動時に `.env` を環境変数として読み込みます。`.env` の作成や
変更後は、VS Code の **Dev Containers: Rebuild Container** を実行してください。
Dev Container を使わない場合は、リポジトリのルートで次のように環境変数を読み込んでから Terraform を実行します。

```bash
set -a
. ./.env
set +a
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "CLOUDFLARE_API_TOKEN が読み込めていません" >&2
  exit 1
fi
terraform init
terraform plan
terraform apply
```

Jenkins には ID が `cloudflare-api-token` の **Secret text** 認証情報として
API トークンを登録し、Credentials Binding プラグインを有効にしてください。
トークンには対象アカウントの Cloudflare Pages 編集権限と、対象ゾーンの DNS
編集権限が必要です。Deploy ステージは `main` ブランチでのみ実行され、
ビルドと Playwright の各ステージが成功した場合に限りデプロイします。

以前の Terraform 設定で `pphunt` が Git 連携 Pages プロジェクトとして作成済みの
場合は、Direct Upload 設定を適用する前に `terraform plan` の内容を確認してください。
デプロイ方式の切り替えに伴い、Pages プロジェクトの再作成が必要になる場合があります。

Terraform の state、plan ファイル、ローカル変数ファイル、`.terraform/`、
`.env` は Git の管理対象外です。Provider のバージョンを固定して再現性を保つため、
`.terraform.lock.hcl` は Git で管理してください。

## 機能の構成

- `src/feature/player-search/` にはプレイヤー検索のページと UI コンポーネントがあります。
- `src/feature/scoresaber/` には検索 UI で使用する ScoreSaber のデータフックとレスポンス型があります。

## Google Analytics 4

本番ビルドでは `react-ga4` で測定 ID `G-JQRSE94FW4` に直接イベントを送信します。
開発ビルドでは計測しません。ページビューは Google tag の自動計測に任せ、
イベントとして二重送信しません。

| イベント | 計測内容 |
| --- | --- |
| `page_view` | Google tag によるアプリの表示 |
| `player_search` | デバウンス後の検索結果。検索語は送らず、文字数帯・結果数・成否を送信 |
| `player_selected` | 検索候補からのプレイヤー選択 |
| `recommendation_analysis_started` / `recommendation_analysis_completed` / `recommendation_analysis_failed` | 分析の開始・結果・所要時間・件数・失敗数 |
| `recommendation_tab_selected` | 更新候補／未プレイ候補タブの選択 |
| `leaderboard_opened` | ScoreSaber譜面ページへの遷移。譜面名やIDは送信しない |
| `playlist_export` | プレイリストの出力成否、出力数、BeatSaver Key の照会失敗数 |

イベントには検索語、プレイヤー名・ID、譜面名・IDを含めません。初回のデータが
GA4 のレポートに表示されるまで最大 48 時間かかる場合があります。リアルタイム
レポートまたは DebugView で先に受信状況を確認できます。

このテンプレートは、Vite の HMR と ESLint ルールを使って React を動かすための
最小構成です。

## E2E テスト（Playwright）

Playwright のテストでは ScoreSaber API のレスポンスをモックするため、
実際のサービスには依存しません。標準のテストスイートは、デスクトップ版 Chromium、
Pixel 7 エミュレーション、デスクトップ版 WebKit（Safari）、iPhone 13
エミュレーション（モバイル Safari）を対象にします。Linux devcontainer 内で
次のコマンドを実行してください。

```bash
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

モバイルまたは Safari のプロジェクトだけを実行するには、次のコマンドを使います。

```bash
npm run test:e2e:mobile
npm run test:e2e:safari
```

Playwright の WebKit プロジェクトは Safari と同じブラウザーエンジンでのテストを
提供しますが、Apple の Safari アプリそのものではありません。

最初のコマンドは、コンテナに必要なブラウザー本体と Linux の依存関係を
インストールします。テストランナーは Vite の開発サーバーを自動的に起動し、
ポート 5173 を使用します。

現在、公式プラグインは次の 2 種類を利用できます。

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) は Oxc を使用します。
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) は SWC を使用します。

## React Compiler

React Compiler は、開発時やビルド時のパフォーマンスへの影響を考慮して、この
テンプレートでは有効にしていません。追加する場合は
[公式ドキュメント](https://react.dev/learn/react-compiler/installation)を参照してください。

## ESLint の設定を拡張する

本番アプリケーションを開発する場合は、型情報を使った lint ルールを有効にするため、
ESLint の設定を更新することを推奨します。

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // その他の設定...

      // tseslint.configs.recommended を削除し、次の設定に置き換えます
      tseslint.configs.recommendedTypeChecked,
      // より厳格な設定を使う場合はこちらを選択します
      tseslint.configs.strictTypeChecked,
      // スタイルのルールも追加する場合はこちらを選択します
      tseslint.configs.stylisticTypeChecked,

      // その他の設定...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```

また、[eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) と
[eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) を
インストールできます。

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // その他の設定...

      // React 用のルールを有効にします
      reactX.configs['recommended-typescript'],
      // React DOM 用のルールを有効にします
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```
