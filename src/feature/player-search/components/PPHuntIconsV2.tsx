import { Glyph } from "../../../common/ascii/Glyph";
import { AsciiSpinner } from "../../../common/ascii/AsciiWidgets";

/**
 * Icon set for the ASCII design: single-ink terminal glyphs in the monospace
 * stack instead of SVG strokes. Same exports as before so call sites stay put.
 */

export function SearchIconV2() {
  return <Glyph char="◎" size="1.05em" />;
}

export function ClearIconV2() {
  return <Glyph char="✕" size="0.95em" />;
}

export function LightModeIconV2() {
  return <Glyph char="◉" size="1.1em" />;
}

export function DarkModeIconV2() {
  return <Glyph char="☾" size="1.15em" />;
}

export function RankIconV2() {
  return <Glyph char="▂▄▆█" size="0.85em" />;
}

export function ExternalLinkIconV2() {
  return (
    <Glyph
      char="↗"
      size="0.8em"
      sx={{ ml: 0.5, verticalAlign: "baseline" }}
    />
  );
}

export type ProfileIconKind =
  | "globe"
  | "trophy"
  | "star"
  | "target"
  | "gamepad"
  | "hash"
  | "calendar"
  | "eye"
  | "headset"
  | "controller";

const PROFILE_GLYPHS: Record<ProfileIconKind, string> = {
  globe: "◍",
  trophy: "♛",
  star: "★",
  target: "◎",
  gamepad: "⊕",
  hash: "#",
  calendar: "▤",
  eye: "◉",
  headset: "⛉",
  controller: "⊞",
};

export function ProfileIconV2({
  kind,
  size = 16,
}: {
  kind: ProfileIconKind;
  size?: number;
}) {
  return <Glyph char={PROFILE_GLYPHS[kind]} size={size} />;
}

/** Loading indicator: the braille dots spinner from ascii.rest. */
export function SpinnerV2({ size = 16 }: { size?: number }) {
  return <AsciiSpinner size={size} />;
}
