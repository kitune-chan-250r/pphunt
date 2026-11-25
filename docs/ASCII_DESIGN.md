# PPHunt ASCII Art Design — 調査・デザイン案・実装計画

## 1. 調査結果（このプロジェクトで採用できる手法）

| 候補 | 評価 | 理由 |
| --- | --- | --- |
| **ascii.rest** | **採用** | React/TS/Vite と相性◎、依存ゼロ、236 の既製アニメ + `kit` で自作可能。`prefers-reduced-motion`・画面外停止・ResizeObserver を内蔵。MIT。 |
| textmode.js | 不採用 | WebGL2 必須・フォールバックなし。UI 統合よりクリエイティブコーディング向け。 |
| @sister.software/asciify | 不採用 | 画像/動画の ASCII 変換が主目的。本アプリに素材画像は不要。 |
| Three.js AsciiEffect | 不採用 | 3D シーン新設はオーバーヘッド。既存の画面構成を変えない方針に反する。 |
| ASCILINE / ASCII Motion | 参考のみ | DOM 物理連携・素材オーサリングは将来の拡張候補。 |
| 独自実装（文字グリッドを毎フレーム React で更新） | **禁止事項のため不採用** | 低品質化と描画コストのリスク。ascii.rest の canvas/atlas レンダラを使う。 |

ascii.rest の主要 API:

- `<Ascii piece={...} mono />` … 色付きピースでも単一インク（`currentColor`）で `<pre>` に描画 → テーマ追従のモノクロ ASCII が可能
- `mount(el, piece, { fps })` … React 再レンダリングなしで毎フレーム描画
- `kit`: `stars()`, `plasma()`, `waves()` などの look、`spinner()`, `progressBar()`, `gauge()` などの widget、`border()`, `layer()` の合成
- ピースは自動で「画面外なら停止」「reduced-motion では静止画」

## 2. デザイン案 — 「Terminal Editorial」

参考: 0+X（ASCII を主役のビジュアルに）、ASCILINE（UI とアニメの連動）、planetscale 風の静かなターミナル美学。

- **背景モチーフ**: 画面全面に固定の低密度アンビエント場（`stars + plasma`、単一インク・低透過度）＋ヒーロー背後に **レーダー走査**（`radar`）。PPHunt＝「PP を狩る」のメタファー。走査線が候補を探し出す動きを表現する。
- **タイポグラフィ**: 全面モノスペース基調（JetBrains Mono Variable + Noto Sans JP フォールバック）。数値は tabular で揃う。
- **UI の ASCII 化**:
  - パネル = 角に `┌ ┐ └ ┘`、上部に `┤ title ├` を置くターミナル・フレーム
  - アイコン = ANSI/ボックス描画グリフ（`◎ ⦸ ◉ ☾ ▂▄▆█ ★ ↗ ⇣ ◍` 等）をモノスペースで描画
  - スピナー = ブレイユ `⠋⠙⠹…`、プログレスバー = `█░` 8分目ブロック
  - ワードマーク = `banner()` のブロック文字（glint 演出）、ヘッダーは小サイズ
  - タブ/ボタン/チップは角丸を廃し、`[ ]` の角括弧と hairline で终端然とした輪郭に
- **カラー**: 現行の ScoreSaber 言語（黒曜石キャンバス + アンバー差し色）を維持。ライトは温かみのある紙色。彩度を抑え ASCII の階調を主役にする。
- **画面構成は変更しない**: ヘッダー／中央のワードマーク＋検索バー／選択後のプロフィール＋分析＋候補リスト、タブ、書き出しボタン、その配置はそのまま。

## 3. 実装計画

1. `ascii.rest` / JetBrains Mono を導入し、テーマトークンを终端風へ更新（`pphuntThemeV2.ts`）
2. `src/common/ascii/` に共通部品を追加
   - `pieces.ts` … アンビエント場・ヒーローモチーフ等の合成（メモ化）
   - `AsciiBackdrop.tsx` … viewport グリッドに合わせて再構築する固定背景レイヤ
   - `AsciiPanel.tsx` … 角グリフ＋タイトル付きフレーム
   - `AsciiIcon.tsx` … ANSI グリフ・アイコンセット
   - `AsciiSpinner.tsx` / `AsciiProgress.tsx` … ascii.rest widget（値は ref 経由で毎フレーム読取、React 再レンダリングなし）
3. ヒーロー: `PPHuntWordmarkV2` を ASCII banner 化、`PlayerSearchBarV2` を终端風フィールドに
4. 結果画面: `PlayerProfileCard` / `AnalysisProgressCard` / `MapRecommendationCard` / `RecommendationResults`（Empty State は ASCII イラスト）を AsciiPanel 基調へ
5. アクセシビリティ維持: e2e が依存する aria-label・テキスト（`検索するプレイヤー名`, `検索欄をクリア`, `検索中…`, タブ名, `書き出す`, `分析完了` 等）は変更しない。ASCII 装飾はすべて `aria-hidden`
6. `prefers-reduced-motion`: ascii.rest の静止画フォールバック＋framer-motion の既存制御に委譲
7. ビルド / lint / unit test / e2e / ブラウザでの目視確認
