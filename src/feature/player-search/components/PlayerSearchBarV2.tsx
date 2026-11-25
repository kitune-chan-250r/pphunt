import {
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Autocomplete,
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  useTheme,
  type AutocompleteRenderInputParams,
} from "@mui/material";
import type { HTMLAttributes, ReactNode } from "react";
import { ClearIconV2, SpinnerV2 } from "./PPHuntIconsV2";
import { Glyph } from "../../../common/ascii/Glyph";
import { PlayerSearchOptionV2 } from "./PlayerSearchOptionV2";
import { LoadingListboxV2 } from "./LoadingListboxV2";
import { designTokens } from "./pphuntThemeV2";
import type { Player } from "../../scoresaber/types/PlayerSearchResult";

type PlayerSearchStatusProps = HTMLAttributes<HTMLDivElement> & {
  ownerState?: {
    loading?: boolean;
    noOptionsText?: ReactNode;
    options?: Player[];
  };
};

const PlayerSearchStatusV2 = ({
  children,
  ownerState,
  ...props
}: PlayerSearchStatusProps) => (
  <Box {...props}>
    {children}
    {!ownerState?.loading && ownerState?.options?.length === 0 ? (
      <Box
        sx={{ px: 2, py: 1.75, color: "text.secondary" }}
      >
        {ownerState.noOptionsText}
      </Box>
    ) : null}
  </Box>
);

export interface PlayerSearchBarV2Props {
  value: string;
  autoCompleteOptions: Player[];
  isSearching?: boolean;
  errorMessage?: string | null;
  compact?: boolean;
  onChange: (nextValue: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  onPlayerSelect?: (player: Player) => void;
}

/**
 * Same behaviour as PlayerSearchBar (controlled input, debounced autocomplete,
 * clear + submit), redesigned with a flatter visual language:
 * one accent, hairline borders, consistent 12px radius, no decorative shadow.
 */
export const PlayerSearchBarV2 = ({
  value,
  autoCompleteOptions,
  isSearching = false,
  errorMessage = null,
  compact = false,
  onChange,
  onClear,
  onSubmit,
  onPlayerSelect,
}: PlayerSearchBarV2Props) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClearClick = useCallback(() => {
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.target !== inputRef.current ||
      event.key !== "Enter" ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    // Arrow-key navigation sets aria-activedescendant on the input; in
    // that case let the Autocomplete itself select the highlighted option.
    const hasHighlightedOption = Boolean(
      inputRef.current?.getAttribute("aria-activedescendant"),
    );
    if (hasHighlightedOption) {
      return;
    }

    // Plain Enter with candidates on screen selects the top candidate,
    // instead of merely closing the candidate list.
    if (autoCompleteOptions.length > 0 && onPlayerSelect) {
      event.preventDefault();
      event.stopPropagation();
      onPlayerSelect(autoCompleteOptions[0]);
      return;
    }

    onSubmit();
  };

  const renderInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField
        {...params}
        fullWidth
        variant="outlined"
        placeholder="検索するプレイヤー名を入力"
        inputRef={inputRef}
        autoFocus
        slotProps={{
          ...params.slotProps,
          htmlInput: {
            ...params.slotProps.htmlInput,
            "aria-label": "検索するプレイヤー名",
            autoComplete: "off",
          },
          input: {
            ...params.slotProps.input,
            startAdornment: (
              <InputAdornment position="start">
                <Box
                  sx={{
                    display: "flex",
                    color: isDark
                      ? designTokens.accent.dark
                      : designTokens.accent.light,
                  }}
                >
                  <Glyph char="$" size="1em" />
                </Box>
              </InputAdornment>
            ),
            endAdornment: value ? (
              <InputAdornment position="end">
                <Tooltip title="検索欄をクリア">
                  <IconButton
                    type="button"
                    onClick={handleClearClick}
                    edge="end"
                    size="small"
                    aria-label="検索欄をクリア"
                  >
                    <ClearIconV2 />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null,
          },
        }}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 0,
            height: compact ? 40 : 48,
            bgcolor: isDark
              ? designTokens.surface.dark
              : designTokens.surface.light,
            caretColor: isDark
              ? designTokens.accent.dark
              : designTokens.accent.light,
            "& fieldset": {
              borderColor: isDark
                ? designTokens.hairline.dark
                : designTokens.hairline.light,
            },
            "&.Mui-focused fieldset": {
              borderColor: isDark
                ? designTokens.accent.dark
                : designTokens.accent.light,
              borderWidth: 1.5,
            },
          },
          "& .MuiOutlinedInput-input": {
            fontSize: compact ? "0.875rem" : "0.9375rem",
            py: compact ? 0.5 : 1,
          },
        }}
      />
    ),
    [compact, handleClearClick, isDark, value],
  );

  return (
    <Stack
      component="form"
      onSubmit={handleFormSubmit}
      onKeyDownCapture={handleFormKeyDown}
      sx={{ width: "100%", maxWidth: 584, alignItems: "stretch" }}
    >
      <Autocomplete
        options={autoCompleteOptions}
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.name
        }
        value={null}
        inputValue={value}
        onInputChange={(_, nextValue, reason) => {
          if (reason === "input") onChange(nextValue);
        }}
        onChange={(_, selectedPlayer) => {
          if (selectedPlayer && typeof selectedPlayer !== "string") {
            onPlayerSelect?.(selectedPlayer);
          }
        }}
        renderInput={renderInput}
        renderOption={(props, option) => (
          <PlayerSearchOptionV2
            key={props.key}
            props={props}
            option={option}
            isDark={isDark}
          />
        )}
        loading={isSearching}
        loadingText={
          <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <SpinnerV2 />
            <span>検索中…</span>
          </Stack>
        }
        // MUI suppresses noOptionsText for freeSolo, so render it in the status slot.
        slots={{
          listbox: LoadingListboxV2,
          status: PlayerSearchStatusV2,
        }}
        slotProps={{ popper: { keepMounted: true } }}
        noOptionsText={
          errorMessage ??
          (value.length < 3
            ? "3文字以上で検索"
            : isSearching
              ? "検索中…"
              : "該当するプレイヤーがありません")
        }
        sx={{ width: "100%" }}
        freeSolo
      />

      {/* <Stack
        direction="row"
        spacing={1.5}
        sx={{ mt: 3.5, justifyContent: "center" }}
      >
        <Button type="submit" variant="contained">
          PPHunt 検索
        </Button>
        <Button
          type="button"
          variant="outlined"
          disabled={!value}
          onClick={handleClearClick}
        >
          クリア
        </Button>
      </Stack> */}
    </Stack>
  );
};
