import {
  Box,
  Card,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import type { useMapRecommendations } from "../hooks/useMapRecommendations";

type MapRecommendationsAnalysis = ReturnType<typeof useMapRecommendations>;

interface AnalysisProgressCardProps {
  analysis: MapRecommendationsAnalysis;
}

const numberFormat = new Intl.NumberFormat("en-US");

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
    <Card
      variant="outlined"
      sx={{
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
        borderColor: "divider",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600 }}>
            {analysis.player.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Global Rank #{numberFormat.format(analysis.player.stats.rank)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {analysis.isLoading && <SpinnerV2 size={16} />}
          <Typography variant="body2" color="text.secondary" role="status">
            {getStatusLabel(analysis)}
          </Typography>
        </Stack>
      </Stack>
      {analysis.isLoading && (
        <LinearProgress
          variant={progressValue === undefined ? "indeterminate" : "determinate"}
          value={progressValue}
          sx={{ mt: 1.5, borderRadius: 4, height: 4 }}
        />
      )}
    </Card>
  );
};
