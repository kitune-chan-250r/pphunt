import { useCallback, useRef, type FormEvent } from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  useTheme,
  type AutocompleteRenderInputParams,
} from "@mui/material";
import { ClearIconV2, SearchIconV2, SpinnerV2 } from "./PPHuntIconsV2";
import { PlayerSearchOptionV2 } from "./PlayerSearchOptionV2";
import { LoadingListboxV2 } from "./LoadingListboxV2";
import { designTokens } from "./pphuntThemeV2";
import type { Player } from "../../scoresaber/types/PlayerSearchResult";

export interface PlayerSearchBarV2Props {
  value: string;
  autoCompleteOptions: Player[];
  isSearching?: boolean;
  errorMessage?: string | null;
  onChange: (nextValue: string) => void;
  onClear: () => void;
  onSubmit: () => void;
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
  onChange,
  onClear,
  onSubmit,
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
                      ? designTokens.muted.dark
                      : designTokens.muted.light,
                  }}
                >
                  <SearchIconV2 />
                </Box>
              </InputAdornment>
            ),
            endAdornment: value ? (
              <InputAdornment position="end">
                <Tooltip title="検索欄をクリア">
                  <IconButton
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
            borderRadius: `${designTokens.radius.field}px`,
            height: 48,
            bgcolor: isDark
              ? designTokens.surface.dark
              : designTokens.surface.light,
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
            fontSize: "1rem",
            py: 1,
          },
        }}
      />
    ),
    [handleClearClick, isDark, value],
  );

  return (
    <Stack
      component="form"
      onSubmit={handleFormSubmit}
      sx={{ width: "100%", maxWidth: 584, alignItems: "stretch" }}
    >
      <Autocomplete
        options={autoCompleteOptions}
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.name
        }
        value={null}
        inputValue={value}
        onInputChange={(_, nextValue) => onChange(nextValue)}
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
        slots={{ listbox: LoadingListboxV2 }}
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

      <Stack
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
      </Stack>
    </Stack>
  );
};
