import { useMemo, useState } from "react";
import "@fontsource-variable/geist";
import {
  Box,
  Container,
  CssBaseline,
  IconButton,
  Stack,
  ThemeProvider,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { DarkModeIconV2, LightModeIconV2 } from "../components/PPHuntIconsV2";
import { PlayerSearchBarV2 } from "../components/PlayerSearchBarV2";
import { PPHuntWordmarkV2 } from "../components/PPHuntWordmarkV2";
import {
  createPPHuntThemeV2,
  designTokens,
} from "../components/pphuntThemeV2";

type ThemeMode = "light" | "dark";

export const PPHuntPageV2 = () => {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const [modeOverride, setModeOverride] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = modeOverride ?? (prefersDarkMode ? "dark" : "light");
  const isDark = mode === "dark";

  const theme = useMemo(() => createPPHuntThemeV2(mode), [mode]);

  const {
    playerSearchResults,
    playerSearchString,
    isSearching,
    searchError,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
    clearSearch,
  } = usePlayerSearch();

  const handleSubmit = () => {
    searchPlayerWithDebounce.flush();
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: { xs: 2, sm: 3 },
            py: 1.5,
            borderBottom: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
          }}
        >
          <PPHuntWordmarkV2 isDark={isDark} variant="header" />
          <Tooltip
            title={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          >
            <IconButton
              onClick={() => setModeOverride(isDark ? "light" : "dark")}
              aria-label="カラーテーマを切り替え"
            >
              {isDark ? <LightModeIconV2 /> : <DarkModeIconV2 />}
            </IconButton>
          </Tooltip>
        </Box>

        <Container
          component="main"
          maxWidth="md"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: { xs: 6, sm: 10 },
          }}
        >
          <PPHuntWordmarkV2 isDark={isDark} variant="hero" />

          <PlayerSearchBarV2
            autoCompleteOptions={playerSearchResults}
            value={playerSearchString}
            isSearching={isSearching}
            errorMessage={searchError}
            onChange={handlePlayerSearchStringChange}
            onClear={clearSearch}
            onSubmit={handleSubmit}
          />

          <Stack
            direction="row"
            spacing={2}
            sx={{ mt: 3, alignItems: "center", color: "text.secondary" }}
          >
            <Typography
              variant="body2"
              color={searchError ? "error" : "text.secondary"}
              role={searchError ? "alert" : undefined}
            >
              {searchError ??
                (isSearching
                  ? "検索中…"
                  : `${playerSearchResults.length} 件の候補`)}
            </Typography>
            <Typography variant="body2">3文字以上で自動補完</Typography>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
};
