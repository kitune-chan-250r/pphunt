import { useEffect, useRef, useState } from "react";
import { mount } from "ascii.rest";
import { Box } from "@mui/material";
import { createBackdropPiece, huntRadar } from "./pieces";

/** A kit piece's grid limits: size() only accepts 1-320 cols x 1-120 rows. */
const MAX_COLS = 320;
const MAX_ROWS = 120;
/** The original fixed grid; the responsive grid never drops below it. */
const BASE_COLS = 160;
const BASE_ROWS = 64;
/** JetBrains Mono's advance width as a fraction of the font size. */
const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.2;

type SkyLayout = { cols: number; rows: number; fontSize: number };

/**
 * The grid and glyph size that make the sky span the whole viewport. The
 * design's glyph size is clamp(6px, 1.04vw, 20px) — at 160 columns that is
 * exactly one viewport width — but a fixed 160x64 grid under-covers outside
 * that band: capped at 20px its text is at most 1920px wide (ultrawide
 * screens keep a blank right side), and at the 6px floor its 64 rows reach
 * only ~461px down (portrait phones keep a blank lower half). So the grid
 * grows past 160x64 wherever coverage needs it, and where even the kit's
 * 320x120 cap could not cover, the glyphs grow past the clamp instead so
 * the capped grid still spans the viewport exactly.
 */
const measureSkyLayout = (): SkyLayout => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const preferred = Math.min(20, Math.max(6, vw * 0.0104));
  const fit = Math.max(
    vw / (CHAR_WIDTH * MAX_COLS),
    vh / (LINE_HEIGHT * MAX_ROWS),
  );
  const fontSize = Math.max(preferred, fit);
  const cols = Math.min(
    MAX_COLS,
    Math.max(BASE_COLS, Math.ceil(vw / (CHAR_WIDTH * fontSize)) + 1),
  );
  const rows = Math.min(
    MAX_ROWS,
    Math.max(BASE_ROWS, Math.ceil(vh / (LINE_HEIGHT * fontSize)) + 1),
  );
  return { cols, rows, fontSize };
};

/**
 * Fixed full-viewport ambient sky drawn imperatively with mount(): one ink,
 * very low opacity, never interactive, hidden from assistive tech. The radar
 * sweep sits behind the hero area as the "PP hunting" motif.
 */
export const AsciiBackdrop = () => {
  const skyRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLPreElement>(null);
  const [layout, setLayout] = useState<SkyLayout>(measureSkyLayout);

  // Follow resizes (debounced, so a drag re-derives the grid once it
  // settles): rotating a phone or moving a window to another monitor must
  // not leave the sky sized for the old viewport.
  useEffect(() => {
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setLayout((prev) => {
          const next = measureSkyLayout();
          return prev.cols === next.cols &&
            prev.rows === next.rows &&
            prev.fontSize === next.fontSize
            ? prev
            : next;
        });
      }, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!skyRef.current) return;
    return mount(skyRef.current, createBackdropPiece(layout.cols, layout.rows));
  }, [layout.cols, layout.rows]);

  useEffect(() => {
    if (!radarRef.current) return;
    return mount(radarRef.current, huntRadar, { fps: 12, unit: "pp" });
  }, []);

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Box
        ref={skyRef}
        component="pre"
        sx={{
          position: "absolute",
          inset: 0,
          m: 0,
          fontFamily: "inherit",
          fontSize: `${layout.fontSize}px`,
          lineHeight: LINE_HEIGHT,
          whiteSpace: "pre",
          opacity: { xs: 0.16, sm: 0.22 },
          color: "text.secondary",
        }}
      />
      <Box
        ref={radarRef}
        component="pre"
        sx={{
          position: "absolute",
          top: "14%",
          left: "50%",
          transform: "translateX(-50%)",
          m: 0,
          fontFamily: "inherit",
          fontSize: "clamp(5px, 0.78vw, 11px)",
          lineHeight: 1.2,
          whiteSpace: "pre",
          opacity: 0.2,
          color: "primary.main",
        }}
      />
    </Box>
  );
};
