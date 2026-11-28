import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Container,
  CssBaseline,
  FormControl,
  IconButton,
  Link,
  MenuItem,
  Select,
  Stack,
  ThemeProvider,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import { usePlayerSearch } from "../hooks/usePlayerSearch";
import { DarkModeIconV2, LightModeIconV2 } from "../components/PPHuntIconsV2";
import { PlayerSearchBarV2 } from "../components/PlayerSearchBarV2";
import { PPHuntWordmarkV2 } from "../components/PPHuntWordmarkV2";
import { BuildVersionV2 } from "../components/BuildVersionV2";
import { AsciiBackdrop } from "../../../common/ascii/AsciiBackdrop";
import { createPPHuntThemeV2, designTokens } from "../components/pphuntThemeV2";
import type { Player } from "../../scoresaber/types/PlayerSearchResult";
import { MapRecommend } from "../../map-recommend/components/MapRecommend";
import {
  initializeAnalytics,
  trackEvent,
} from "../../../common/analytics/googleAnalytics";
import { useTranslation } from "react-i18next";
import i18n, {
  changeAppLanguage,
  getAppLanguage,
  supportedLanguages,
} from "../../../i18n";

type ThemeMode = "light" | "dark";

export const PPHuntPageV2 = () => {
  const { t } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  useEffect(() => {
    initializeAnalytics();
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("page.title");
  }, [language, t]);

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const [modeOverride, setModeOverride] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = modeOverride ?? (prefersDarkMode ? "dark" : "light");
  const isDark = mode === "dark";
  const reduceMotion = useReducedMotion();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const theme = useMemo(() => createPPHuntThemeV2(mode), [mode]);

  const {
    playerSearchResults,
    playerSearchString,
    isSearching,
    searchError,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
    setPlayerSearchString,
    clearSearch,
  } = usePlayerSearch();

  const handleSubmit = () => {
    searchPlayerWithDebounce.flush();
  };

  const handlePlayerSelect = (player: Player) => {
    trackEvent({ event: "player_selected" });
    setSelectedPlayer(player);
    setPlayerSearchString(player.name);
  };

  const shouldAnimate = !reduceMotion;
  const entranceEase = [0.22, 1, 0.36, 1] as const;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          color: "text.primary",
        }}
      >
        <AsciiBackdrop />
        <Box
          component="header"
          sx={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: { xs: 2, sm: 3 },
            py: selectedPlayer ? 0.5 : 1.5,
            borderBottom: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
          }}
        >
          <PPHuntWordmarkV2 isDark={isDark} variant="header" />
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <FormControl size="small" variant="outlined">
              <Select
                value={language}
                onChange={(event) => {
                  const nextLanguage = supportedLanguages.find(
                    (supportedLanguage) =>
                      supportedLanguage === event.target.value,
                  );
                  if (nextLanguage) {
                    void changeAppLanguage(nextLanguage).catch((error: unknown) =>
                      console.error(
                        "[PPHuntPageV2] Failed to change language.",
                        error,
                      ),
                    );
                  }
                }}
                aria-label={t("language.selector")}
                sx={{
                  minWidth: 104,
                  borderRadius: 0,
                  fontSize: "0.8125rem",
                  "& .MuiSelect-select": { py: 0.75 },
                }}
              >
                {supportedLanguages.map((supportedLanguage) => (
                  <MenuItem key={supportedLanguage} value={supportedLanguage}>
                    {t(
                      supportedLanguage === "ja"
                        ? "language.japanese"
                        : "language.english",
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip
              title={
                isDark ? t("theme.switchToLight") : t("theme.switchToDark")
              }
            >
              <IconButton
                onClick={() => setModeOverride(isDark ? "light" : "dark")}
                aria-label={t("theme.selector")}
              >
                {isDark ? <LightModeIconV2 /> : <DarkModeIconV2 />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        <Container
          component="main"
          maxWidth="lg"
          sx={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: selectedPlayer ? "stretch" : "center",
            justifyContent: selectedPlayer ? "flex-start" : "center",
            pt: selectedPlayer ? { xs: 2, sm: 0.5 } : { xs: 6, sm: 10 },
            // Extra bottom padding lifts the hero lockup so the autocomplete
            // popper always has room to open below the search bar.
            pb: selectedPlayer ? { xs: 3, sm: 4 } : { xs: 18, sm: 24 },
          }}
        >
          <motion.div
            layout={shouldAnimate}
            transition={{
              layout: {
                duration: shouldAnimate ? 0.8 : 0,
                ease: entranceEase,
              },
            }}
            style={{ width: "100%" }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
                maxWidth: 584,
                mx: "auto",
              }}
            >
              <PPHuntWordmarkV2
                isDark={isDark}
                variant="hero"
                compact={Boolean(selectedPlayer)}
              />

              <PlayerSearchBarV2
                compact={Boolean(selectedPlayer)}
                autoCompleteOptions={playerSearchResults}
                value={playerSearchString}
                isSearching={isSearching}
                errorMessage={searchError}
                onChange={handlePlayerSearchStringChange}
                onClear={clearSearch}
                onSubmit={handleSubmit}
                onPlayerSelect={handlePlayerSelect}
              />

              <Stack
                direction="row"
                spacing={2}
                sx={{
                  mt: selectedPlayer ? 1 : 3,
                  alignItems: "center",
                  justifyContent: "center",
                  color: "text.secondary",
                }}
              >
                {/* <Typography
                  variant="body2"
                  color={searchError ? "error" : "text.secondary"}
                  role={searchError ? "alert" : undefined}
                >
                  {searchError ??
                    (isSearching
                      ? "検索中…"
                      : `${playerSearchResults.length} 件の候補`)}
                </Typography> */}
                {/* <Typography variant="body2">3文字以上で自動補完</Typography> */}
              </Stack>
            </Box>
          </motion.div>

          {selectedPlayer ? (
            <MapRecommend playerId={selectedPlayer.id} />
          ) : null}
        </Container>

        <Box
          component="footer"
          sx={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "center",
            px: 2,
            py: 2,
            borderTop: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
          }}
        >
          <Link
            href="/guide/"
            underline="hover"
            color="text.secondary"
            variant="body2"
          >
            {t("page.guide")}
          </Link>
        </Box>
        <BuildVersionV2 />
      </Box>
    </ThemeProvider>
  );
};
