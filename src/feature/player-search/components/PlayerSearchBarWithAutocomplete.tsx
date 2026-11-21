import { Autocomplete, Stack, useTheme } from "@mui/material";
import React from "react";

export const PlayerSearchBarWithAutocomplete = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Stack
      // component="form"
      // onSubmit={handleFormSubmit}
      sx={{ width: "100%", maxWidth: 584, alignItems: "center" }}
    >
      <Autocomplete
        fullWidth
        options={[]}
        // variant="outlined"
        // value={value}
        // onChange={handleInputChange}
        // placeholder="検索するプレイヤー名を入力"
        // inputRef={inputRef}
        autoFocus
        slotProps={{}}
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

      {/* <Stack
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
      </Stack> */}
    </Stack>
  );
};
