import { SvgIcon, type SvgIconProps } from "@mui/material";

/**
 * Icon set for the beatlist feature, matching the shared stroke-icon language
 * (24x24 viewBox, 1.75 stroke, currentColor) used across the redesigned UI.
 */
function StrokeIcon({ children, ...rest }: SvgIconProps) {
  return (
    <SvgIcon
      viewBox="0 0 24 24"
      fontSize="small"
      aria-hidden
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

export function DownloadIconV2() {
  return (
    <StrokeIcon>
      <path d="M12 4v10M8 10.5 12 14.5l4-4" />
      <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
    </StrokeIcon>
  );
}
