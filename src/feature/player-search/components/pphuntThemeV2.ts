import { createTheme, type Theme } from "@mui/material/styles";

/**
 * Design tokens for the redesigned PPHunt UI.
 * Palette follows ScoreSaber's own visual language (obsidian canvas, amber
 * accent, warm neutrals, Geist) rather than Google's blue/multicolor look.
 */
export const designTokens = {
  radius: { field: 12, control: 10, popper: 12, option: 8 },
  accent: { light: "#facc15", dark: "#facc15" },
  accentInk: { light: "#422006", dark: "#422006" },
  accentSoft: {
    light: "rgba(250, 204, 21, 0.16)",
    dark: "rgba(250, 204, 21, 0.14)",
  },
  hairline: { light: "#e7e5e4", dark: "#2a2a2e" },
  ink: { light: "#221e1c", dark: "#e7e7e4" },
  muted: { light: "#78716c", dark: "#a8a29e" },
  surface: { light: "#ffffff", dark: "#141416" },
  canvas: { light: "#faf9f8", dark: "#09090b" },
  font: '"Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif, "Noto Sans JP", "Noto Color Emoji", sans-serif',
} as const;

export const createPPHuntThemeV2 = (mode: "light" | "dark"): Theme => {
  const isDark = mode === "dark";
  const short = "150ms";

  const theme = createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? designTokens.accent.dark : designTokens.accent.light,
        contrastText: designTokens.accentInk.light,
      },
      background: {
        default: isDark ? designTokens.canvas.dark : designTokens.canvas.light,
        paper: isDark ? designTokens.surface.dark : designTokens.surface.light,
      },
      text: {
        primary: isDark ? designTokens.ink.dark : designTokens.ink.light,
        secondary: isDark ? designTokens.muted.dark : designTokens.muted.light,
      },
      divider: isDark
        ? designTokens.hairline.dark
        : designTokens.hairline.light,
    },
    shape: { borderRadius: designTokens.radius.control },
    typography: {
      fontFamily: designTokens.font,
      h1: {
        fontSize: "clamp(3rem, 14vw, 5rem)",
        fontWeight: 500,
        letterSpacing: "-0.01em",
        lineHeight: 1.15,
      },
      body2: { fontSize: "0.875rem", lineHeight: 1.5 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.9375rem",
            borderRadius: designTokens.radius.control,
            padding: "10px 20px",
            transition: `background-color ${short} ease, border-color ${short} ease, box-shadow ${short} ease`,
          },
          contained: {
            bgcolor: isDark
              ? designTokens.accent.dark
              : designTokens.accent.light,
            color: designTokens.accentInk.light,
            "&:hover": {
              bgcolor: isDark
                ? designTokens.accent.dark
                : designTokens.accent.light,
              boxShadow: `0 0 0 3px ${isDark ? designTokens.accentSoft.dark : designTokens.accentSoft.light}`,
            },
          },
          outlined: {
            borderColor: isDark
              ? designTokens.hairline.dark
              : designTokens.hairline.light,
            color: isDark ? designTokens.ink.dark : designTokens.ink.light,
            "&:hover": {
              borderColor: isDark
                ? designTokens.accent.dark
                : designTokens.accent.light,
              bgcolor: isDark
                ? designTokens.accentSoft.dark
                : designTokens.accentSoft.light,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: 8,
            color: isDark ? designTokens.muted.dark : designTokens.muted.light,
            transition: `background-color ${short} ease, color ${short} ease`,
            "&:hover": {
              bgcolor: isDark
                ? designTokens.accentSoft.dark
                : designTokens.accentSoft.light,
              color: isDark
                ? designTokens.accent.dark
                : designTokens.accent.light,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
            borderRadius: designTokens.radius.popper,
          },
        },
      },
      MuiPopper: {
        styleOverrides: {
          root: {
            marginTop: 6,
            borderRadius: designTokens.radius.popper,
            bgcolor: isDark
              ? designTokens.surface.dark
              : designTokens.surface.light,
            border: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
            boxShadow: isDark
              ? "0 6px 20px rgba(0, 0, 0, 0.45)"
              : "0 6px 20px rgba(32, 33, 36, 0.12)",
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          option: {
            padding: "10px 12px",
            margin: `2px ${designTokens.radius.option}px`,
            borderRadius: designTokens.radius.option,
            fontSize: "0.9375rem",
            lineHeight: 1.4,
          },
          noOptions: {
            padding: "10px 12px",
            fontSize: "0.875rem",
            color: isDark ? designTokens.muted.dark : designTokens.muted.light,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: "0.8125rem",
            borderRadius: 6,
            bgcolor: isDark ? "#3c4043" : "#202124",
            color: "#ffffff",
          },
        },
      },
    },
  });

  return theme;
};
