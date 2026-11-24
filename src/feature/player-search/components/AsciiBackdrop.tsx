import { useEffect, useState } from "react";
import { Box, useMediaQuery } from "@mui/material";
import { designTokens } from "./pphuntThemeV2";
import asciiCubesImage from "../../../assets/ascii-cubes.jpg";
import asciiCubesVideo from "../../../assets/ascii-cubes.mp4";

/**
 * Full-page backdrop showing the Devault-generated ASCII-art animation of
 * Beat Saber cubes (red/blue cubes with white arrows on black). The artwork
 * is a pre-rendered video/image asset — there is no runtime ASCII renderer.
 * It is blended into the page canvas with fade gradients so the cubes read
 * as background texture and never compete with the UI.
 */
export const AsciiBackdrop = ({
  isDark,
  suspended = false,
}: {
  isDark: boolean;
  /** When suspended (e.g. a player is selected and the main content is
   * being read / analysed), show the still image only and stop the video
   * so the backdrop costs nothing while the UI is busy. */
  suspended?: boolean;
}) => {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Mount the artwork a few seconds after the page opens, so the
  // full-screen media never competes with the initial render or the
  // user's first interactions (its decode/paint cost is non-trivial on
  // low-power devices). Until then the page is just the plain canvas.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timerId = window.setTimeout(() => setReady(true), 3000);
    return () => window.clearTimeout(timerId);
  }, []);
  const canvas = isDark ? designTokens.canvas.dark : designTokens.canvas.light;
  // The artwork sits on pure black, so in light mode it is kept much fainter
  // and faded over a wider area to avoid a grey wash behind the content.
  const mediaOpacity = isDark ? 0.42 : 0.13;
  const radialFade = isDark
    ? `radial-gradient(ellipse 90% 65% at 50% 38%, transparent 55%, ${canvas} 100%)`
    : `radial-gradient(ellipse 95% 75% at 50% 38%, transparent 30%, ${canvas} 88%)`;

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        // Keep the backdrop in its own composited layer so page updates
        // never trigger a repaint of the full-screen artwork.
        transform: "translateZ(0)",
        contain: "layout paint",
        isolation: "isolate",
      }}
    >
      {!ready ? null : prefersReducedMotion || suspended ? (
        <Box
          component="img"
          src={asciiCubesImage}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: mediaOpacity,
            display: "block",
          }}
        />
      ) : (
        <Box
          component="video"
          src={asciiCubesVideo}
          poster={asciiCubesImage}
          autoPlay
          muted
          loop
          playsInline
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: mediaOpacity,
            display: "block",
          }}
        />
      )}

      {/* Fade the artwork into the canvas colour at the edges and bottom.
          Rendered together with the artwork (after idle) so the page is
          literally the plain canvas until the backdrop mounts. */}
      {ready ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: [
              radialFade,
              `linear-gradient(to bottom, transparent 55%, ${canvas} 96%)`,
              `linear-gradient(to right, ${canvas} 0%, transparent 14%, transparent 86%, ${canvas} 100%)`,
            ].join(", "),
          }}
        />
      ) : null}
    </Box>
  );
};
