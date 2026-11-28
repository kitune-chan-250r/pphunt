import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mount } from "ascii.rest";
import { Box } from "@mui/material";
import { AsciiView } from "./AsciiView";
import { dotsSpinner, liveProgressBar, scanningBand } from "./pieces";
import { useTranslation } from "react-i18next";

/** Columns the bar's trailing "  100%" takes, so the track can fill the rest. */
const PERCENT_COLS = 5;

/**
 * How many monospace columns fit inside a host element, kept up to date as the
 * viewport changes. The host is a block <pre>, so its width comes from its
 * parent and measuring it never depends on what is drawn in it.
 */
const useHostColumns = (hostRef: { current: HTMLElement | null }) => {
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize) || 13;
      const ctx = document.createElement("canvas").getContext("2d");
      // An exact advance width in the host's own font when a canvas is available,
      // else JetBrains Mono's 0.6em advance.
      const charWidth = ctx
        ? ((ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`),
          ctx.measureText("█").width || size * 0.6)
        : size * 0.6;
      const fit = Math.floor((el.clientWidth - 2) / charWidth);
      setColumns((prev) => (prev !== fit ? fit : prev));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hostRef]);

  return columns;
};

/** Braille dots spinner drawn by ascii.rest, in currentColor. */
export const AsciiSpinner = ({
  size = 16,
  label,
}: {
  size?: number;
  label?: string;
}) => {
  const { t } = useTranslation();
  return (
    <Box
      component="span"
      role="status"
      aria-label={label ?? t("ascii.searching")}
      sx={{ display: "inline-flex", flexShrink: 0, lineHeight: 1 }}
    >
      <AsciiView piece={dotsSpinner} sx={{ fontSize: size, color: "inherit" }} />
    </Box>
  );
};

/**
 * █░ progress bar that spans its parent's whole width, reading its value live
 * inside the piece so React never remounts it while the analysis ticks along.
 * Shows a scrolling band of the same width when the phase has no measurable
 * progress yet.
 */
export const AsciiProgress = ({
  value,
  /** Columns to fall back on before the host has been measured. */
  fallbackWidth = 36,
}: {
  /** Percent 0-100; undefined while indeterminate. */
  value?: number;
  fallbackWidth?: number;
}) => {
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  // The piece polls this holder every frame, so React never remounts it.
  const valueRef = useRef(value ?? 0);
  const indeterminate = value === undefined;
  const columns = useHostColumns(preRef);

  useEffect(() => {
    valueRef.current = value ?? valueRef.current;
  }, [value]);

  useEffect(() => {
    if (!preRef.current) return;
    const available = columns || fallbackWidth;
    return mount(
      preRef.current,
      indeterminate
        ? scanningBand(available)
        : liveProgressBar(
            () => valueRef.current,
            Math.max(10, Math.min(300, available - PERCENT_COLS)),
          ),
    );
  }, [indeterminate, columns, fallbackWidth]);

  return (
    <Box
      component="pre"
      ref={preRef}
      role="img"
      aria-label={
        indeterminate
          ? t("ascii.analyzing")
          : t("ascii.progress", { percent: Math.round(value) })
      }
      sx={{
        m: 0,
        fontFamily: "inherit",
        fontSize: "0.8125rem",
        lineHeight: 1.2,
        whiteSpace: "pre",
        overflow: "hidden",
        color: "primary.main",
      }}
    />
  );
};
