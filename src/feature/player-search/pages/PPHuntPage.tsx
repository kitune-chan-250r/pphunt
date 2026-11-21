import { useMemo, useState } from "react";
import {
  Box,
  Container,
  CssBaseline,
  IconButton,
  ThemeProvider,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { DarkModeIcon, LightModeIcon } from "../components/PPHuntIcons";
import { PlayerSearchBar } from "../components/PlayerSearchBar";
import {
  createPPHuntTheme,
  LOGO_LETTERS,
} from "../components/pphuntTheme";

export const PPHuntPage = () => {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const [modeOverride, setModeOverride] = useState<"light" | "dark" | null>(
    null,
  );
  const mode = modeOverride ?? (prefersDarkMode ? "dark" : "light");
  const isDark = mode === "dark";

  const theme = useMemo(() => createPPHuntTheme(mode), [mode]);

  const {
    playerSearchResults,
    playerSearchString,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
    searchError,
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
            justifyContent: "flex-end",
            px: { xs: 2, sm: 3 },
            py: 1.5,
          }}
        >
          <Tooltip
            title={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          >
            <IconButton
              onClick={() => setModeOverride(isDark ? "light" : "dark")}
              aria-label="カラーテーマを切り替え"
              size="small"
              sx={{ color: "text.secondary" }}
            >
              {isDark ? <LightModeIcon /> : <DarkModeIcon />}
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
            pb: { xs: 8, sm: 14 },
          }}
        >
          <Typography
            variant="h1"
            aria-label="PPHunt"
            sx={{
              fontSize: {
                xs: "clamp(3.25rem, 16vw, 4.5rem)",
                sm: "5.5rem",
              },
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              mb: 3.5,
              userSelect: "none",
              textAlign: "center",
            }}
          >
            {LOGO_LETTERS.map((item, index) => (
              <Box
                key={`${item.char}-${index}`}
                component="span"
                sx={{ color: isDark ? item.dark : item.light }}
              >
                {item.char}
              </Box>
            ))}
          </Typography>

          <PlayerSearchBar
            autoCompleteOptions={playerSearchResults}
            value={playerSearchString}
            errorMessage={searchError}
            onChange={handlePlayerSearchStringChange}
            onClear={clearSearch}
            onSubmit={handleSubmit}
          />
        </Container>
      </Box>
    </ThemeProvider>
  );
};
