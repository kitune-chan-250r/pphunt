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

export function ExternalLinkIconV2() {
  return (
    <StrokeIcon sx={{ fontSize: 16, verticalAlign: "text-bottom" }}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </StrokeIcon>
  );
}

export type ProfileIconKind =
  | "globe"
  | "trophy"
  | "star"
  | "target"
  | "gamepad"
  | "hash"
  | "calendar"
  | "eye"
  | "headset"
  | "controller";

export function ProfileIconV2({
  kind,
  size = 16,
}: {
  kind: ProfileIconKind;
  size?: number;
}) {
  const sx = { fontSize: size };

  switch (kind) {
    case "globe":
      return (
        <StrokeIcon sx={sx}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </StrokeIcon>
      );
    case "trophy":
      return (
        <StrokeIcon sx={sx}>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM12 13v5M8 21h8M10 18h4" />
          <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" />
        </StrokeIcon>
      );
    case "star":
      return (
        <StrokeIcon sx={sx}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z" />
        </StrokeIcon>
      );
    case "target":
      return (
        <StrokeIcon sx={sx}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </StrokeIcon>
      );
    case "gamepad":
      return (
        <StrokeIcon sx={sx}>
          <path d="M7 9h10a4 4 0 0 1 3.8 5.2l-.8 2.6a2 2 0 0 1-3.2 1L14 16h-4l-2.8 1.8a2 2 0 0 1-3.2-1l-.8-2.6A4 4 0 0 1 7 9z" />
          <path d="M7 11v4M5 13h4M16.5 12.5h.01M18.5 14.5h.01" />
        </StrokeIcon>
      );
    case "hash":
      return (
        <StrokeIcon sx={sx}>
          <path d="M5 9h14M4 15h14M10 4 8 20M16 4l-2 16" />
        </StrokeIcon>
      );
    case "calendar":
      return (
        <StrokeIcon sx={sx}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 10h18" />
        </StrokeIcon>
      );
    case "eye":
      return (
        <StrokeIcon sx={sx}>
          <path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6z" />
          <circle cx="12" cy="12" r="2.5" />
        </StrokeIcon>
      );
    case "headset":
      return (
        <StrokeIcon sx={sx}>
          <path d="M3 13v-2a9 9 0 0 1 18 0v2" />
          <path d="M3 13h4v6H5a2 2 0 0 1-2-2v-4zM21 13h-4v6h2a2 2 0 0 0 2-2v-4z" />
        </StrokeIcon>
      );
    case "controller":
      return (
        <StrokeIcon sx={sx}>
          <path d="M6 10h12a3 3 0 0 1 2.8 4l-1 3a2 2 0 0 1-3.2.9L14 16h-4l-2.6 1.9a2 2 0 0 1-3.2-.9l-1-3A3 3 0 0 1 6 10z" />
          <path d="M7 12v4M5 14h4M16.5 13.5h.01M18.5 15.5h.01" />
        </StrokeIcon>
      );
  }
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
