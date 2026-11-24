import { Stack, Typography } from "@mui/material";
import { designTokens } from "./pphuntThemeV2";

/**
 * Cube mark, in the spirit of a Beat Saber note block: a rounded square in
 * the amber accent with a white cut-out arrow. The wordmark type itself is
 * unchanged from the original design.
 */
type WordmarkVariant = "hero" | "header";

const markSize: Record<WordmarkVariant, number> = { hero: 48, header: 20 };

const CubeMark = ({ size, accent }: { size: number; accent: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    aria-hidden="true"
    style={{ display: "block", flexShrink: 0 }}
  >
    <rect x="3" y="3" width="42" height="42" rx="10" fill={accent} />
    <path
      d="M24 11 L36.5 25.5 L29.5 25.5 L29.5 37 L18.5 37 L18.5 25.5 L11.5 25.5 Z"
      fill="#ffffff"
    />
  </svg>
);

export const PPHuntWordmarkV2 = ({
  isDark,
  variant = "hero",
  compact = false,
}: {
  isDark: boolean;
  variant?: WordmarkVariant;
  compact?: boolean;
}) => {
  const accent = isDark ? designTokens.accent.dark : designTokens.accent.light;
  const ink = isDark ? designTokens.ink.dark : designTokens.ink.light;
  const isCompactHero = variant === "hero" && compact;
  const mark = isCompactHero ? 28 : markSize[variant];

  return (
    <Stack
      direction="row"
      spacing={isCompactHero ? 1 : variant === "hero" ? 1.5 : 1}
      sx={{
        alignItems: "center",
        marginBottom: isCompactHero ? 1.5 : variant === "hero" ? 3.5 : 0,
      }}
      aria-label="PPHunt"
    >
      <CubeMark size={mark} accent={accent} />

      <Typography
        variant={variant === "hero" ? "h1" : "body2"}
        sx={{
          color: ink,
          fontWeight: 500,
          fontSize: isCompactHero ? { xs: "2rem", sm: "2.5rem" } : undefined,
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
