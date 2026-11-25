import type { ReactNode } from "react";
import { Box, useTheme } from "@mui/material";

interface AsciiPanelProps {
  /** Optional terminal legend shown on the top border: ┤ title ├ */
  title?: string;
  component?: "div" | "section" | "article";
  ariaLabel?: string;
  children: ReactNode;
  sx?: Parameters<typeof Box>[0]["sx"];
}

const CORNERS = [
  { glyph: "┌", pos: { top: -1, left: -1 } },
  { glyph: "┐", pos: { top: -1, right: -1 } },
  { glyph: "└", pos: { bottom: -1, left: -1 } },
  { glyph: "┘", pos: { bottom: -1, right: -1 } },
] as const;

/**
 * Terminal-flavoured panel: a hairline frame with box-drawing corners and an
 * optional ┤ legend ├ title. Square corners, one ink, decorative glyphs only.
 */
export const AsciiPanel = ({
  title,
  component = "div",
  ariaLabel,
  children,
  sx,
}: AsciiPanelProps) => {
  const theme = useTheme();
  const borderColor = theme.palette.divider;
  const paper = theme.palette.background.paper;

  return (
    <Box
      component={component}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      sx={{
        position: "relative",
        border: `1px solid ${borderColor}`,
        borderRadius: 0,
        bgcolor: paper,
        backgroundImage: "none",
        px: { xs: 2, sm: 2.5 },
        py: { xs: 2, sm: 2.5 },
        ...sx,
      }}
    >
      {CORNERS.map(({ glyph, pos }) => (
        <Box
          key={glyph}
          component="span"
          aria-hidden="true"
          sx={{
            position: "absolute",
            ...pos,
            transform: "translate(-1px, -1px)",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            lineHeight: 1,
            color: "text.disabled",
          }}
        >
          {glyph}
        </Box>
      ))}

      {title ? (
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: "-0.7em",
            left: 12,
            px: "0.5em",
            bgcolor: paper,
            fontFamily: "inherit",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            lineHeight: 1.4,
            color: "text.secondary",
            whiteSpace: "nowrap",
          }}
        >
          {`┤ ${title} ├`}
        </Box>
      ) : null}

      {children}
    </Box>
  );
};
