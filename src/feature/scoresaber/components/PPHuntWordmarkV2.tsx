import { Box, Stack, Typography } from "@mui/material";
import { designTokens } from "./pphuntThemeV2";

/**
 * Pixel-block mark, in the spirit of ScoreSaber's logo: a stepped grid of
 * squares rather than a rounded, multicolour wordmark.
 */
const PIXEL_ROWS = ["....", "..##", ".###", "####"] as const;

type WordmarkVariant = "hero" | "header";

const cellSize: Record<WordmarkVariant, number> = { hero: 12, header: 5 };

export const PPHuntWordmarkV2 = ({
  isDark,
  variant = "hero",
}: {
  isDark: boolean;
  variant?: WordmarkVariant;
}) => {
  const accent = isDark ? designTokens.accent.dark : designTokens.accent.light;
  const ink = isDark ? designTokens.ink.dark : designTokens.ink.light;
  const cell = cellSize[variant];

  return (
    <Stack
      direction="row"
      spacing={variant === "hero" ? 1.5 : 1}
      sx={{
        alignItems: "center",
        marginBottom: variant === "hero" ? 3.5 : 0,
      }}
      aria-label="PPHunt"
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${PIXEL_ROWS[0].length}, ${cell}px)`,
          gridAutoRows: `${cell}px`,
          gap: variant === "hero" ? "2px" : "1px",
        }}
      >
        {PIXEL_ROWS.flatMap((row, rowIndex) =>
          row.split("").map((char, colIndex) => (
            <Box
              key={`${rowIndex}-${colIndex}`}
              component="span"
              sx={{
                width: cell,
                height: cell,
                bgcolor: char === "#" ? accent : "transparent",
              }}
            />
          )),
        )}
      </Box>

      <Typography
        variant={variant === "hero" ? "h1" : "body2"}
        sx={{
          color: ink,
          fontWeight: 500,
          letterSpacing: variant === "hero" ? "-0.01em" : "0.01em",
          lineHeight: 1.15,
          userSelect: "none",
        }}
      >
        PPHunt
      </Typography>
    </Stack>
  );
};
