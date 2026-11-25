import { useEffect, useRef } from "react";
import { mount } from "ascii.rest";
import { Box } from "@mui/material";
import { AsciiView } from "./AsciiView";
import { dotsSpinner, liveProgressBar, scanningBand } from "./pieces";

/** Braille dots spinner drawn by ascii.rest, in currentColor. */
export const AsciiSpinner = ({
  size = 16,
  label = "検索中",
}: {
  size?: number;
  label?: string;
}) => (
  <Box
    component="span"
    role="status"
    aria-label={label}
    sx={{ display: "inline-flex", flexShrink: 0, lineHeight: 1 }}
  >
    <AsciiView piece={dotsSpinner} sx={{ fontSize: size, color: "inherit" }} />
  </Box>
);

/**
 * █░ progress bar that reads its value live inside the piece, so React never
 * remounts it while the analysis ticks along. Shows a scrolling band when the
 * phase has no measurable progress yet.
 */
export const AsciiProgress = ({
  value,
  width = 32,
}: {
  /** Percent 0-100; undefined while indeterminate. */
  value?: number;
  width?: number;
}) => {
  const preRef = useRef<HTMLPreElement>(null);
  // The piece polls this holder every frame, so React never remounts it.
  const valueRef = useRef(value ?? 0);
  const indeterminate = value === undefined;

  useEffect(() => {
    valueRef.current = value ?? valueRef.current;
  }, [value]);

  useEffect(() => {
    if (indeterminate || !preRef.current) return;
    return mount(
      preRef.current,
      liveProgressBar(() => valueRef.current, width),
    );
  }, [indeterminate, width]);

  if (indeterminate) {
    return (
      <AsciiView
        piece={scanningBand}
        label="分析中"
        sx={{ fontSize: "0.8125rem", color: "primary.main" }}
      />
    );
  }

  return (
    <Box
      component="pre"
      ref={preRef}
      role="img"
      aria-label={`進捗 ${Math.round(value)}%`}
      sx={{
        m: 0,
        fontFamily: "inherit",
        fontSize: "0.8125rem",
        lineHeight: 1.2,
        whiteSpace: "pre",
        color: "primary.main",
      }}
    />
  );
};
