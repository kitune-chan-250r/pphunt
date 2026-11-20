import { Box } from "@mui/material";
import { designTokens } from "./pphuntThemeV2";
import "flag-icons/css/flag-icons.min.css";

/**
 * Country flag icon backed by the `flag-icons` SVG sprite (image-based, so it
 * renders identically regardless of the OS emoji font). Falls back to a neutral
 * flag glyph when the country code is missing or not ISO 3166-1 alpha-2.
 */
const toFlagCode = (code: string): string | null =>
  /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : null;

function FlagGlyph({ isDark }: { isDark: boolean }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      aria-hidden="true"
      sx={{
        fill: "none",
        stroke: isDark ? designTokens.muted.dark : designTokens.muted.light,
        strokeWidth: 1.75,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        flexShrink: 0,
      }}
    >
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 3.5L18 11H5" />
    </Box>
  );
}

export interface CountryFlagV2Props {
  country: string;
  isDark: boolean;
  title?: string;
}

export const CountryFlagV2 = ({ country, isDark, title }: CountryFlagV2Props) => {
  const code = toFlagCode(country);
  const label = title ?? (country || "不明");

  if (!code) {
    return (
      <Box sx={{ display: "flex", alignItems: "center" }} title={label}>
        <FlagGlyph isDark={isDark} />
      </Box>
    );
  }

  return (
    <Box
      component="span"
      className={`fi fis fi-${code}`}
      title={label}
      aria-label={`国旗: ${country.toUpperCase()}`}
      sx={{
        fontSize: "1rem",
        lineHeight: 1,
        flexShrink: 0,
        borderRadius: 3,
        overflow: "hidden",
      }}
    />
  );
};
