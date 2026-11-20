import {
  Box,
  Card,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
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
  if (analysis.phase === "done") return "分析完了";
  return "準備中";
};

export const AnalysisProgressCard = ({
  analysis,
}: AnalysisProgressCardProps) => {
  if (!analysis.player) return null;

  const progressValue = getProgressValue(analysis);

  return (
    <Stack spacing={1.5}>
      <PlayerProfileCard player={analysis.player} />
      <Card
        variant="outlined"
        sx={{
          px: { xs: 2, sm: 3 },
          py: { xs: 2, sm: 2.5 },
          bgcolor: "background.paper",
          borderColor: "divider",
          borderRadius: "14px",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
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
          <LinearProgress
            variant={
              progressValue === undefined ? "indeterminate" : "determinate"
            }
            value={progressValue}
            sx={{
              mt: 2,
              borderRadius: 2,
              height: 4,
              bgcolor: "action.hover",
              "& .MuiLinearProgress-bar": { borderRadius: 2 },
            }}
          />
        )}
      </Card>
    </Stack>
  );
};
