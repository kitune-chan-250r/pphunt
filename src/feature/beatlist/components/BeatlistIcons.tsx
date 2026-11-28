import { Glyph } from "../../../common/ascii/Glyph";

/**
 * Icon set for the beatlist feature, matching the shared terminal-glyph
 * language used across the ASCII redesign.
 */

export function DownloadIconV2() {
  return <Glyph char="⇣" size="1.05em" />;
}

/** 出力完了を示すチェック記号（書き出しボタンの完了フィードバック用）。 */
export function CheckIconV2() {
  return <Glyph char="✓" size="1.05em" />;
}
