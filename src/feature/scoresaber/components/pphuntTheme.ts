import { createTheme } from "@mui/material";

export const LOGO_LETTERS = [
  { char: "P", light: "#4285F4", dark: "#8AB4F8" },
  { char: "P", light: "#EA4335", dark: "#F28B82" },
  { char: "H", light: "#FBBC05", dark: "#FDD663" },
  { char: "u", light: "#4285F4", dark: "#8AB4F8" },
  { char: "n", light: "#34A853", dark: "#81C995" },
  { char: "t", light: "#EA4335", dark: "#F28B82" },
] as const;

export const createPPHuntTheme = (mode: "light" | "dark") => {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      background: {
        default: isDark ? "#202124" : "#ffffff",
        paper: isDark ? "#303134" : "#ffffff",
      },
      text: {
        primary: isDark ? "#e8eaed" : "#202124",
        secondary: isDark ? "#9aa0a6" : "#5f6368",
      },
    },
    typography: {
      fontFamily:
        '"Segoe UI", "Noto Sans JP", "Roboto", "Helvetica", "Arial", sans-serif',
    },
  });
};
