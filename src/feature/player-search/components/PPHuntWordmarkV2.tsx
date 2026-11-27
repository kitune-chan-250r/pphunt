import { Box, Stack } from "@mui/material";
import { Banner } from "ascii.rest/react";

/**
 * Wordmark in the ASCII design: "PPHUNT" drawn as a block-letter banner with
 * a slow glint; the header keeps a compact mono lockup with a block mark.
 */
type WordmarkVariant = "hero" | "header";

export const PPHuntWordmarkV2 = ({
  variant = "hero",
  compact = false,
}: {
  isDark?: boolean;
  variant?: WordmarkVariant;
  compact?: boolean;
}) => {
  if (variant === "header") {
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center" }}
        aria-label="PPHunt"
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{ fontSize: "0.95rem", lineHeight: 1, color: "primary.main" }}
        >
          ▟█
        </Box>
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: "0.95rem",
            letterSpacing: "0.14em",
            userSelect: "none",
          }}
        >
          PPHUNT
        </Box>
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        marginBottom: compact ? 0.75 : 3.5,
      }}
    >
      <Banner
        text="PPHUNT"
        label="PPHunt"
        shadow="rounded"
        effect="glint"
        font={compact ? "slim" : "block"}
        pixel={compact ? 1 : 2}
        style={{
          margin: 0,
          fontFamily: "inherit",
          lineHeight: 1.2,
          fontSize: compact
            ? "clamp(8px, 2.2vw, 11px)"
            : "clamp(7px, 2.3vw, 15px)",
          color: "inherit",
        }}
      />
    </Box>
  );
};
