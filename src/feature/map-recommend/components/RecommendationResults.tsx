import { useState } from "react";
import {
  Alert,
  Box,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import type { useMapRecommendations } from "../hooks/useMapRecommendations";
import { MapRecommendationCard } from "./MapRecommendationCard";

type MapRecommendationsAnalysis = ReturnType<typeof useMapRecommendations>;

interface RecommendationResultsProps {
  analysis: MapRecommendationsAnalysis;
  playerId: string;
}

const EmptyState = ({
  isLoading,
  isDone,
  activeTab,
}: {
  isLoading: boolean;
  isDone: boolean;
  activeTab: number;
}) => (
  <Box
    sx={{
      py: 6,
      px: 2,
      textAlign: "center",
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
    }}
  >
    {isLoading ? (
      <Stack spacing={1.5} sx={{ alignItems: "center" }}>
        <SpinnerV2 size={22} />
        <Typography variant="body2" color="text.secondary">
          スコアを集めながら候補を解析しています…
        </Typography>
      </Stack>
    ) : (
      <Typography variant="body2" color="text.secondary">
        {isDone
          ? activeTab === 0
            ? "条件に合う未プレイ譜面は見つかりませんでした。"
            : "周辺プレイヤーより高いスコアの譜面は見つかりませんでした。"
          : "分析を開始しています…"}
      </Typography>
    )}
  </Box>
);

export const RecommendationResults = ({
  analysis,
  playerId,
}: RecommendationResultsProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const recommendations =
    activeTab === 0 ? analysis.unplayed : analysis.improvements;

  return (
    <Stack spacing={3}>
      {analysis.error && <Alert severity="error">{analysis.error}</Alert>}
      {!playerId.trim() && (
        <Alert severity="info">プレイヤーIDを指定すると分析を開始します。</Alert>
      )}
      {analysis.failedPlayers > 0 && (
        <Alert severity="warning">
          {analysis.failedPlayers}
          人分のスコアを取得できませんでした。取得できたデータで分析を続けています。
        </Alert>
      )}
      {analysis.failedMaps > 0 && (
        <Alert severity="warning">
          {analysis.failedMaps}譜面のプレイ状況を確認できませんでした。
        </Alert>
      )}
      {analysis.player?.stats.plusOnePP === null &&
        (analysis.phase === "done" || analysis.phase === "maps") && (
          <Alert severity="info">
            ScoreSaberから plusOnePP
            が提供されていないため、未プレイ譜面のPP条件を判定できません。スコア更新候補は引き続き表示します。
          </Alert>
        )}

      <Box>
        <Tabs
          value={activeTab}
          onChange={(_, value: number) => setActiveTab(value)}
          aria-label="譜面のおすすめ分類"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            label={`未プレイ・PP候補 (${analysis.unplayed.length})`}
            id="recommend-tab-0"
            aria-controls="recommend-panel-0"
          />
          <Tab
            label={`スコア更新候補 (${analysis.improvements.length})`}
            id="recommend-tab-1"
            aria-controls="recommend-panel-1"
          />
        </Tabs>
      </Box>

      <Stack
        role="tabpanel"
        id={`recommend-panel-${activeTab}`}
        aria-labelledby={`recommend-tab-${activeTab}`}
        spacing={1.25}
      >
        {recommendations.map((recommendation) => (
          <MapRecommendationCard
            key={recommendation.leaderboard.id}
            recommendation={recommendation}
          />
        ))}

        {recommendations.length === 0 && !analysis.error && (
          <EmptyState
            isLoading={analysis.isLoading}
            isDone={analysis.phase === "done"}
            activeTab={activeTab}
          />
        )}
      </Stack>
    </Stack>
  );
};
