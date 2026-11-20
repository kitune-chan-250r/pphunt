import { Box, SvgIcon, type SvgIconProps } from "@mui/material";

/**
 * Icon set for the redesigned UI: single visual language (24x24 viewBox,
 * 1.75 stroke, currentColor) instead of mixed Material fill glyphs.
 */
const baseProps: SvgIconProps = {
  viewBox: "0 0 24 24",
  fontSize: "small",
  "aria-hidden": true,
};

function StrokeIcon({ children, ...rest }: SvgIconProps) {
  return (
    <SvgIcon
      {...baseProps}
      {...rest}
      sx={{
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.75,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...rest.sx,
      }}
    >
      {children}
    </SvgIcon>
  );
}

export function SearchIconV2() {
  return (
    <StrokeIcon>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.2 15.2 20 20" />
    </StrokeIcon>
  );
}

export function ClearIconV2() {
  return (
    <StrokeIcon>
      <path d="M6 6l12 12M18 6 6 18" />
    </StrokeIcon>
  );
}

export function LightModeIconV2() {
  return (
    <StrokeIcon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </StrokeIcon>
  );
}

export function DarkModeIconV2() {
  return (
    <StrokeIcon>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </StrokeIcon>
  );
}

export function RankIconV2() {
  return (
    <StrokeIcon>
      <path d="M4 20h16M6 20V9M12 20V4M18 20v-8" />
    </StrokeIcon>
  );
}

/** Loading indicator matching the stroke-icon language. */
export function SpinnerV2({ size = 16 }: { size?: number }) {
  return (
    <Box
      component="span"
      role="status"
      aria-label="検索中"
      sx={{
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
        animation: "pphunt-spin 0.9s linear infinite",
        "@keyframes pphunt-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="42 14"
        />
      </svg>
    </Box>
  );
}
