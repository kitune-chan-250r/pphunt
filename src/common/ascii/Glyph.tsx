import { Box } from "@mui/material";

/**
 * A terminal glyph used in place of an SVG icon: one monospace character in
 * currentColor, decorative by default.
 */
export const Glyph = ({
  char,
  size = "1em",
  sx,
}: {
  char: string;
  size?: number | string;
  sx?: Parameters<typeof Box>[0]["sx"];
}) => (
  <Box
    component="span"
    aria-hidden="true"
    sx={{
      display: "inline-block",
      fontFamily: "inherit",
      fontSize: size,
      lineHeight: 1,
      textAlign: "center",
      userSelect: "none",
      ...sx,
    }}
  >
    {char}
  </Box>
);
