import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { AsciiPanel } from "../../../common/ascii/AsciiPanel";
import { AsciiView } from "../../../common/ascii/AsciiView";
import { huntRadar } from "../../../common/ascii/pieces";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import {
  PlaylistExportAlert,
  PlaylistExportButton,
  PlaylistExportProvider,
} from "../../beatlist/components/PlaylistExport";
import type { PlaylistSourceSong } from "../../beatlist/types/beatlist";
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
  <AsciiPanel sx={{ py: 6, px: 2, textAlign: "center" }}>
    <Box sx={{ display: "flex", justifyContent: "center", mb: 1.5 }}>
      <AsciiView
        piece={huntRadar}
        options={{ fps: 10 }}
        label="レーダー"
        sx={{
          fontSize: "clamp(7px, 1.4vw, 11px)",
          color: "text.disabled",
        }}
      />
    </Box>
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
            ? "周辺プレイヤーより高いスコアの譜面は見つかりませんでした。"
            : "条件に合う未プレイ譜面は見つかりませんでした。"
          : "分析を開始しています…"}
      </Typography>
    )}
  </AsciiPanel>
);

export const RecommendationResults = ({
  analysis,
  playerId,
}: RecommendationResultsProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const riseDistance = shouldAnimate ? (isMobile ? 8 : 12) : 0;
  const layoutEase = [0.22, 1, 0.36, 1] as const;
  const recommendations =
    activeTab === 0 ? analysis.improvements : analysis.unplayed;
  const playerName = analysis.player?.name?.trim() || "";
  const tabLabel = activeTab === 0 ? "スコア更新候補" : "未プレイ・PP候補";

  const playlistInput = useMemo(
    () => ({
      title: playerName
        ? `PPHunt ${playerName} ${tabLabel}`
        : `PPHunt ${tabLabel}`,
      author: "PPHunt",
      description: `PPHuntで生成したプレイリスト（${tabLabel} / ${recommendations.length}譜面）`,
      songs: recommendations.map<PlaylistSourceSong>((recommendation) => ({
        hash: recommendation.leaderboard.map.hash,
        bsid: recommendation.leaderboard.map.bsid,
        characteristic: recommendation.leaderboard.difficulty.gameMode,
        difficulty: recommendation.leaderboard.difficulty.rawDifficulty,
      })),
    }),
    [playerName, tabLabel, recommendations],
  );

  return (
    <PlaylistExportProvider input={playlistInput}>
      <Stack spacing={{ xs: 2.5, sm: 3 }}>
        {analysis.error && <Alert severity="error">{analysis.error}</Alert>}
        {!playerId.trim() && (
          <Alert severity="info">
            プレイヤーIDを指定すると分析を開始します。
          </Alert>
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

        <PlaylistExportAlert />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: 1.5 },
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, value: number) => setActiveTab(value)}
            aria-label="譜面のおすすめ分類"
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              flexGrow: 1,
              minWidth: 0,
              minHeight: 48,
              "& .MuiTab-root": {
                minHeight: 48,
                px: { xs: 1.5, sm: 2 },
                color: "text.secondary",
                fontSize: "0.875rem",
                fontWeight: 500,
                textTransform: "none",
              },
              "& .MuiTab-root.Mui-selected": { color: "text.primary" },
              "& .MuiTabs-indicator": { height: 2, borderRadius: 2 },
            }}
          >
            <Tab
              label={`スコア更新候補 (${analysis.improvements.length})`}
              id="recommend-tab-0"
              aria-controls="recommend-panel-0"
            />
            <Tab
              label={`未プレイ・PP候補 (${analysis.unplayed.length})`}
              id="recommend-tab-1"
              aria-controls="recommend-panel-1"
            />
          </Tabs>

          <PlaylistExportButton />
        </Box>

        <Stack
          role="tabpanel"
          id={`recommend-panel-${activeTab}`}
          aria-labelledby={`recommend-tab-${activeTab}`}
          spacing={1.5}
        >
          <LayoutGroup>
            {recommendations.map((recommendation) => (
              <motion.div
                key={recommendation.leaderboard.id}
                layout={shouldAnimate ? "position" : false}
                initial={
                  shouldAnimate ? { opacity: 0, y: riseDistance } : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: shouldAnimate ? 0.45 : 0,
                  ease: layoutEase,
                  layout: {
                    duration: shouldAnimate ? 0.45 : 0,
                    ease: layoutEase,
                  },
                }}
              >
                <MapRecommendationCard recommendation={recommendation} />
              </motion.div>
            ))}
          </LayoutGroup>

          {recommendations.length === 0 && !analysis.error && (
            <EmptyState
              isLoading={analysis.isLoading}
              isDone={analysis.phase === "done"}
              activeTab={activeTab}
            />
          )}
        </Stack>

        {analysis.phase === "done" && (
          <Typography variant="caption" color="text.secondary">
            分析に使用したAPI呼び出し: 約{analysis.apiCallCount}回（周辺
            {analysis.totalPlayers}人のスコアを集計）
          </Typography>
        )}
      </Stack>
    </PlaylistExportProvider>
  );
};
