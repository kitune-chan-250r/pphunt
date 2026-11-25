/**
 * Shared ascii.rest pieces for the PPHunt "Terminal Editorial" design.
 * Composed once at module scope so every mount reuses the same piece and
 * <Ascii>/mount() never restarts them on re-render.
 */
import {
  marquee,
  plasma,
  progressBar,
  spinner,
  stars,
} from "ascii.rest/kit/recipes";
import * as radar from "ascii.rest/pieces/radar";

/** Ambient sky: stars twinkling over a slow plasma drift, one ink. */
export const backdropPiece = stars()
  .add(plasma())
  .ramp(" .·+*#")
  .size(160, 64)
  .named("pphunt-sky");

/** The PP-hunting radar sweep used behind the hero and in empty states. */
export const huntRadar = radar;

/** Braille dots spinner (1x1, currentColor when mounted on a text host). */
export const dotsSpinner = spinner("dots");

/** Scrolling band shown while a phase has no measurable progress yet. */
export const scanningBand = marquee("▓▒░ SCANNING ░▒▓", { width: 32 });

/**
 * A live █░ bar that reads its percentage from `readValue` every frame, so the
 * value can change without React remounting the piece. `max: 100` matters:
 * progressBar() defaults to a 0-1 share and would clamp any percent to full.
 */
export const liveProgressBar = (readValue: () => number, width = 32) =>
  progressBar({ value: readValue, min: 0, max: 100, style: "blocks", width });
