import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import { DownloadIconV2 } from "./BeatlistIcons";
import {
  usePlaylistExport,
  type PlaylistExportState,
} from "../hooks/usePlaylistExport";
import type { PlaylistExportInput } from "../types/beatlist";

interface PlaylistExportContextValue extends PlaylistExportState {
  exportPlaylist: (input: PlaylistExportInput) => Promise<void>;
  clearError: () => void;
  input: PlaylistExportInput;
}

const PlaylistExportContext = createContext<PlaylistExportContextValue | null>(
  null,
);

/**
 * Owns the playlist export state for a given input so that the button and the
 * alert can be placed independently while sharing one export session.
 */
export const PlaylistExportProvider = ({
  input,
  children,
}: {
  input: PlaylistExportInput;
  children: ReactNode;
}) => {
  const { exportPlaylist, clearError, ...state } = usePlaylistExport();

  const value = useMemo<PlaylistExportContextValue>(
    () => ({ ...state, exportPlaylist, clearError, input }),
    [state, exportPlaylist, clearError, input],
  );

  return (
    <PlaylistExportContext.Provider value={value}>
      {children}
    </PlaylistExportContext.Provider>
  );
};

const usePlaylistExportContext = () => {
  const context = useContext(PlaylistExportContext);
  if (!context) {
    throw new Error(
      "PlaylistExport components must be used inside PlaylistExportProvider",
    );
  }
  return context;
};

/** Dismissible warning shown when an export partially or fully failed. */
export const PlaylistExportAlert = () => {
  const { error, clearError } = usePlaylistExportContext();
  if (!error) return null;
  return (
    <Alert severity="warning" onClose={clearError} sx={{ mb: 0.5 }}>
      {error}
    </Alert>
  );
};

interface PlaylistExportButtonProps {
  /** Hide the label below this breakpoint, matching the host layout. */
  hideLabelOnMobile?: boolean;
}

/** Button (with inline progress) that exports the provider's input as .bplist. */
export const PlaylistExportButton = ({
  hideLabelOnMobile = true,
}: PlaylistExportButtonProps = {}) => {
  const { isExporting, resolvedCount, totalCount, input, exportPlaylist } =
    usePlaylistExportContext();

  const canExport = input.songs.length > 0 && !isExporting;

  return (
    <Button
      variant="outlined"
      size="small"
      onClick={() => void exportPlaylist(input)}
      disabled={!canExport}
      aria-label={
        isExporting
          ? totalCount > 0
            ? `BeatSaverを照会中 ${resolvedCount}/${totalCount}`
            : "プレイリストを作成中"
          : "表示中の候補をBeat Saberプレイリストとしてダウンロード"
      }
      sx={{
        flexShrink: 0,
        height: 40,
        minWidth: hideLabelOnMobile ? { xs: 40, sm: 0 } : undefined,
        width: hideLabelOnMobile ? { xs: 40, sm: "auto" } : undefined,
        px: hideLabelOnMobile ? { xs: 0, sm: 1.5 } : 1.5,
        borderRadius: 0,
        borderColor: "divider",
        bgcolor: "background.paper",
        color: "text.primary",
        gap: 0,
        transition:
          "background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease",
        "& .MuiButton-startIcon": {
          mr: hideLabelOnMobile ? { xs: 0, sm: 1 } : 1,
          ml: 0,
          color: "text.secondary",
          transition: "color 150ms ease",
        },
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "text.disabled",
          "& .MuiButton-startIcon": { color: "primary.main" },
        },
        "&:active": { transform: "translateY(1px)" },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
        "&.Mui-disabled": {
          borderColor: "divider",
          bgcolor: "transparent",
          opacity: 0.55,
        },
      }}
      startIcon={isExporting ? <SpinnerV2 size={14} /> : <DownloadIconV2 />}
    >
      <Box
        component="span"
        sx={
          hideLabelOnMobile
            ? { display: { xs: "none", sm: "inline-flex" } }
            : { display: "inline-flex" }
        }
      >
        {isExporting ? (
          <Stack
            component="span"
            direction="row"
            spacing={1}
            sx={{ alignItems: "baseline", whiteSpace: "nowrap" }}
          >
            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
              準備中
            </Typography>
            {totalCount > 0 && (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {resolvedCount}/{totalCount}
              </Typography>
            )}
          </Stack>
        ) : (
          <Stack
            component="span"
            direction="row"
            spacing={1}
            sx={{ alignItems: "baseline", whiteSpace: "nowrap" }}
          >
            <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
              書き出す
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: "monospace", fontSize: "0.6875rem" }}
            >
              .bplist
            </Typography>
          </Stack>
        )}
      </Box>
    </Button>
  );
};
