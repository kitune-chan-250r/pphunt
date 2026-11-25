import { useEffect, useRef } from "react";
import { mount } from "ascii.rest";
import { Box } from "@mui/material";
import { backdropPiece, huntRadar } from "./pieces";

/**
 * Fixed full-viewport ambient sky drawn imperatively with mount(): one ink,
 * very low opacity, never interactive, hidden from assistive tech. The radar
 * sweep sits behind the hero area as the "PP hunting" motif.
 */
export const AsciiBackdrop = () => {
  const skyRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!skyRef.current) return;
    return mount(skyRef.current, backdropPiece);
  }, []);

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
          fontSize: "clamp(6px, 1.02vw, 15px)",
          lineHeight: 1.2,
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
