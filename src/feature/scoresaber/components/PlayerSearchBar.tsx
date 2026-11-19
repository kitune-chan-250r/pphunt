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
import { ClearIcon, SearchIcon } from "./PPHuntIcons";
import type { Player } from "../types/PlayerSearchResult";

interface PlayerSearchBarProps {
  value: string;
  autoCompleteOptions: Player[];
  onChange: (nextValue: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}

export const PlayerSearchBar = ({
  value,
  autoCompleteOptions,
  onChange,
  onClear,
  onSubmit,
}: PlayerSearchBarProps) => {
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

  const googleButtonSx = {
    bgcolor: isDark ? "#303134" : "#f8f9fa",
    color: isDark ? "#e8eaed" : "#3c4043",
    border: "1px solid",
    borderColor: isDark ? "#303134" : "#f8f9fa",
    borderRadius: "4px",
    px: 2.5,
    py: 1,
    fontSize: "0.875rem",
    fontWeight: 500,
    textTransform: "none" as const,
    "&:hover": {
      bgcolor: isDark ? "#303134" : "#f8f9fa",
      borderColor: isDark ? "#5f6368" : "#dadce0",
      boxShadow: isDark
        ? "0 1px 1px rgba(0, 0, 0, 0.3)"
        : "0 1px 1px rgba(0, 0, 0, 0.1)",
    },
  };

  const renderInput = useCallback(
    (params: AutocompleteRenderInputParams) => {
      return (
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
                <>
                  <InputAdornment position="start" sx={{ pl: 0.5 }}>
                    <Box sx={{ display: "flex", color: "#9aa0a6" }}>
                      <SearchIcon />
                    </Box>
                  </InputAdornment>
                  {params.slotProps.input.startAdornment}
                </>
              ),
              endAdornment: (
                <>
                  {value ? (
                    <InputAdornment position="end">
                      <Tooltip title="検索欄をクリア">
                        <IconButton
                          onClick={handleClearClick}
                          edge="end"
                          size="small"
                          aria-label="検索欄をクリア"
                          sx={{ color: "text.secondary" }}
                        >
                          <ClearIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ) : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "9999px",
              height: 48,
              px: 1.5,
              bgcolor: isDark ? "#303134" : "#ffffff",
              transition: "box-shadow 0.2s ease, background-color 0.2s ease",
              "& fieldset": {
                borderColor: isDark ? "#5f6368" : "#dfe1e5",
              },
              "&:hover, &.Mui-focused": {
                bgcolor: isDark ? "#303134" : "#ffffff",
                boxShadow: isDark
                  ? "0 1px 6px rgba(0, 0, 0, 0.5)"
                  : "0 1px 6px rgba(32, 33, 36, 0.28)",
                "& fieldset": {
                  borderColor: "transparent",
                },
              },
            },
            "& .MuiOutlinedInput-input": {
              fontSize: "1rem",
              py: 1,
            },
          }}
        />
      );
    },
    [handleClearClick, isDark, value],
  );

  return (
    <Stack
      component="form"
      onSubmit={handleFormSubmit}
      sx={{ width: "100%", maxWidth: 584, alignItems: "center" }}
    >
      <Autocomplete
        options={autoCompleteOptions}
        getOptionLabel={(option) => {
          if (typeof option === "string") return option;
          return option.name;
        }}
        value={null}
        inputValue={value}
        onInputChange={(_, nextValue) => onChange(nextValue)}
        renderInput={(params) => renderInput(params)}
        sx={{ width: "100%" }}
        freeSolo
      />
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ mt: 3.5, justifyContent: "center" }}
      >
        <Button
          type="submit"
          variant="contained"
          disableElevation
          sx={googleButtonSx}
        >
          PPHunt 検索
        </Button>
        <Button
          type="button"
          variant="contained"
          disableElevation
          disabled={!value}
          onClick={handleClearClick}
          sx={googleButtonSx}
        >
          クリア
        </Button>
      </Stack>
    </Stack>
  );
};
