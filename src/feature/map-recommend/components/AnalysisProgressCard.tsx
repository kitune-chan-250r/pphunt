import {
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { AsciiPanel } from "../../../common/ascii/AsciiPanel";
import { AsciiProgress } from "../../../common/ascii/AsciiWidgets";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import type { useMapRecommendations } from "../hooks/useMapRecommendations";
import { PlayerProfileCard } from "./PlayerProfileCard";

type MapRecommendationsAnalysis = ReturnType<typeof useMapRecommendations>;

interface AnalysisProgressCardProps {
  analysis: MapRecommendationsAnalysis;
}

const getProgressValue = (analysis: MapRecommendationsAnalysis) => {
  if (analysis.phase === "scores" && analysis.totalPlayers > 0) {
    return (analysis.completedPlayers / analysis.totalPlayers) * 100;
  }
  if (analysis.phase === "maps" && analysis.totalMaps > 0) {
    return (analysis.checkedMaps / analysis.totalMaps) * 100;
  }
  return undefined;
};

const getStatusLabel = (analysis: MapRecommendationsAnalysis) => {
  if (analysis.phase === "scores") {
    return `プレイヤースコア取得中 ${analysis.completedPlayers}/${analysis.totalPlayers}`;
  }
  if (analysis.phase === "maps") {
    return `譜面のプレイ状況を確認中 ${analysis.checkedMaps}/${analysis.totalMaps}`;
  }
  return "準備中";
};

export const AnalysisProgressCard = ({
  analysis,
}: AnalysisProgressCardProps) => {
  if (!analysis.player) return null;

  const progressValue = getProgressValue(analysis);

  return (
    <Stack spacing={1}>
      <PlayerProfileCard player={analysis.player} />
      {analysis.phase === "done" ? (
        <Typography
          variant="caption"
          color="text.secondary"
          role="status"
          sx={{ alignSelf: "flex-end" }}
        >
          分析完了
        </Typography>
      ) : (
        <AsciiPanel title="ANALYSIS">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" },
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                分析状況
              </Typography>
              <Typography variant="body2" color="text.primary" role="status">
                {getStatusLabel(analysis)}
              </Typography>
            </Box>
            {analysis.isLoading && <SpinnerV2 size={16} />}
          </Stack>
          {analysis.isLoading && (
            <Box sx={{ mt: 1.5 }}>
              <AsciiProgress value={progressValue} />
            </Box>
          )}
        </AsciiPanel>
      )}
    </Stack>
  );
};
