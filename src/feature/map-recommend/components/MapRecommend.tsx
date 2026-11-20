import { useMemo } from "react";
import {
  Box,
  Container,
  CssBaseline,
  Stack,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  createPPHuntThemeV2,
} from "../../player-search/components/pphuntThemeV2";
import { AnalysisProgressCard } from "./AnalysisProgressCard";
import { MapRecommendHeader } from "./MapRecommendHeader";
import { RecommendationResults } from "./RecommendationResults";
import { useMapRecommendations } from "../hooks/useMapRecommendations";

interface MapRecommendProps {
  playerId: string;
}

export const MapRecommend = ({ playerId }: MapRecommendProps) => {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () => createPPHuntThemeV2(prefersDarkMode ? "dark" : "light"),
    [prefersDarkMode],
  );
  const analysis = useMapRecommendations(playerId);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100svh",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <MapRecommendHeader isDark={prefersDarkMode} />

        <Container maxWidth="md" component="main" sx={{ py: { xs: 4, sm: 6 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography
                variant="h5"
                sx={{ fontWeight: 600, letterSpacing: "-0.03em" }}
              >
                周辺プレイヤーの譜面を分析
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                近いGlobal Rankのプレイヤーのトップスコアから、次に挑戦する譜面を探します。
              </Typography>
            </Box>

            <AnalysisProgressCard analysis={analysis} />
            <RecommendationResults analysis={analysis} playerId={playerId} />
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
};
