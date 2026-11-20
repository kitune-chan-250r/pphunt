import { Box, Stack, useTheme } from "@mui/material";
import type { HTMLAttributes, Ref } from "react";
import { SpinnerV2 } from "./PPHuntIconsV2";
import { designTokens } from "./pphuntThemeV2";

type LoadingListboxV2Props = HTMLAttributes<HTMLElement> & {
  ownerState?: { loading?: boolean };
  ref?: Ref<HTMLUListElement>;
};

/**
 * Custom listbox slot so the loading indicator stays visible while results
 * from a previous query are still on screen.
 */
export const LoadingListboxV2 = ({
  children,
  className,
  ownerState,
  ref,
  ...rest
}: LoadingListboxV2Props) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <ul
      ref={ref}
      className={className}
      style={{
        listStyle: "none",
        margin: 0,
        padding: "8px 0",
        maxHeight: "40vh",
        overflow: "auto",
        position: "relative",
      }}
      {...rest}
    >
      {ownerState?.loading ? (
        <li key="loading-indicator">
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 1.5,
              py: 1,
              color: isDark
                ? designTokens.accent.dark
                : designTokens.accent.light,
            }}
          >
            <SpinnerV2 />
            <Box component="span" sx={{ fontSize: "0.8125rem" }}>
              検索中…
            </Box>
          </Stack>
        </li>
      ) : null}
      {children}
    </ul>
  );
};
