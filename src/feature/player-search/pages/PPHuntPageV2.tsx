import { useMemo, useState } from "react";
import {
  Box,
  Container,
  CssBaseline,
  IconButton,
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
import { AsciiBackdrop } from "../../../common/ascii/AsciiBackdrop";
import { createPPHuntThemeV2, designTokens } from "../components/pphuntThemeV2";
import type { Player } from "../../scoresaber/types/PlayerSearchResult";
import { MapRecommend } from "../../map-recommend/components/MapRecommend";

type ThemeMode = "light" | "dark";

export const PPHuntPageV2 = () => {
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
          maxWidth="lg"
          sx={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: selectedPlayer ? "stretch" : "center",
            justifyContent: selectedPlayer ? "flex-start" : "center",
            pt: selectedPlayer ? { xs: 3, sm: 4 } : { xs: 6, sm: 10 },
            pb: selectedPlayer ? { xs: 3, sm: 4 } : { xs: 12, sm: 16 },
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
                  mt: 3,
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
      </Box>
    </ThemeProvider>
  );
};
