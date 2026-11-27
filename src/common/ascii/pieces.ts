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

/**
 * Ambient sky at a given grid size: stars twinkling over a slow plasma
 * drift, one ink. Built per size because a kit piece's grid is fixed at
 * build time (and capped at 320x120); AsciiBackdrop derives the size from
 * the viewport so the sky spans any screen.
 */
export const createBackdropPiece = (cols: number, rows: number) =>
  stars().add(plasma()).ramp(" .·+*#").size(cols, rows).named("pphunt-sky");

/** Ambient sky at the original fixed size, the responsive grid's floor. */
export const backdropPiece = createBackdropPiece(160, 64);

/** The PP-hunting radar sweep used behind the hero and in empty states. */
export const huntRadar = radar;

/** Braille dots spinner (1x1, currentColor when mounted on a text host). */
export const dotsSpinner = spinner("dots");

/**
 * Scrolling band shown while a phase has no measurable progress yet. Built per
 * mount so it can span the host's whole width; marquee() takes 4-320 columns.
 */
export const scanningBand = (width = 32) =>
  marquee("▓▒░ SCANNING ░▒▓", { width: Math.max(4, Math.min(320, width)) });

/**
 * A live █░ bar that reads its percentage from `readValue` every frame, so the
 * value can change without React remounting the piece. `max: 100` matters:
 * progressBar() defaults to a 0-1 share and would clamp any percent to full.
 */
export const liveProgressBar = (readValue: () => number, width = 32) =>
  progressBar({ value: readValue, min: 0, max: 100, style: "blocks", width });
