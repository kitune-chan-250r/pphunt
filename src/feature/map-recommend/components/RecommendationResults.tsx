import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Select,
  Slider,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  type SelectChangeEvent,
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
import {
  buildRecommendationView,
  maxStarsOf,
  type RecommendationSortKey,
} from "../lib/recommendationView";
import { MapRecommendationCard } from "./MapRecommendationCard";
import { trackEvent } from "../../../common/analytics/googleAnalytics";
import { useTranslation } from "react-i18next";

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
}) => {
  const { t } = useTranslation();
  return (
    <AsciiPanel sx={{ py: 6, px: 2, textAlign: "center" }}>
      <Box sx={{ display: "flex", justifyContent: "center", mb: 1.5 }}>
        <AsciiView
          piece={huntRadar}
          options={{ fps: 10 }}
          label={t("recommendations.radar")}
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
            {t("recommendations.loading")}
          </Typography>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {isDone
            ? activeTab === 0
              ? t("recommendations.noImprovements")
              : t("recommendations.noUnplayed")
            : t("recommendations.starting")}
        </Typography>
      )}
    </AsciiPanel>
  );
};

export const RecommendationResults = ({
  analysis,
  playerId,
}: RecommendationResultsProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [sortKey, setSortKey] = useState<RecommendationSortKey>("recommended");
  const [starsRange, setStarsRange] = useState<[number, number] | null>(null);
  const [groupBySong, setGroupBySong] = useState(true);
  const [expandedMapIds, setExpandedMapIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const riseDistance = shouldAnimate ? (isMobile ? 8 : 12) : 0;
  const layoutEase = [0.22, 1, 0.36, 1] as const;
  const recommendations =
    activeTab === 0 ? analysis.improvements : analysis.unplayed;
  const playerName = analysis.player?.name?.trim() || "";
  const tabLabel =
    activeTab === 0
      ? t("recommendations.improveCandidates")
      : t("recommendations.unplayedCandidates");
  const sortOptions: { value: RecommendationSortKey; label: string }[] = [
    { value: "recommended", label: t("recommendations.sortRecommended") },
    { value: "deltaPp", label: t("recommendations.sortDeltaPp") },
    { value: "stars", label: t("recommendations.sortStars") },
    { value: "accuracy", label: t("recommendations.sortAccuracy") },
  ];

  // プレイヤーが変わると MapRecommend 側の key で再マウントされ、
  // 表示条件（ソート／フィルタ／展開状態）は既定に戻る。
  const sliderMax = Math.max(
    10,
    Math.ceil(maxStarsOf(recommendations) * 2) / 2,
  );
  const effectiveStarsRange: [number, number] = starsRange ?? [0, sliderMax];

  const view = useMemo(
    () =>
      buildRecommendationView(recommendations, {
        sortKey,
        minStars: starsRange ? starsRange[0] : null,
        maxStars: starsRange ? starsRange[1] : null,
        groupBySong,
      }),
    [recommendations, sortKey, starsRange, groupBySong],
  );

  const isViewModified =
    sortKey !== "recommended" || starsRange !== null || !groupBySong;

  const resetView = () => {
    setSortKey("recommended");
    setStarsRange(null);
    setGroupBySong(true);
    setExpandedMapIds(new Set());
  };

  const toggleGroup = (mapId: number) => {
    setExpandedMapIds((prev) => {
      const next = new Set(prev);
      if (next.has(mapId)) {
        next.delete(mapId);
      } else {
        next.add(mapId);
      }
      return next;
    });
  };

  const playlistInput = useMemo(
    () => ({
      title: playerName
        ? `PPHunt ${playerName} ${tabLabel}`
        : `PPHunt ${tabLabel}`,
      author: "PPHunt",
      description: t("recommendations.playlistDescription", {
        tabLabel,
        count: view.items.length,
      }),
      songs: view.items.map<PlaylistSourceSong>((recommendation) => ({
        hash: recommendation.leaderboard.map.hash,
        bsid: recommendation.leaderboard.map.bsid,
        characteristic: recommendation.leaderboard.difficulty.gameMode,
        difficulty: recommendation.leaderboard.difficulty.rawDifficulty,
      })),
    }),
    [playerName, tabLabel, t, view.items],
  );

  return (
    <PlaylistExportProvider input={playlistInput}>
      <Stack spacing={{ xs: 2, sm: 1.5 }}>
        {analysis.error && (
          <Alert severity="error">{t("analysis.playerFetchFailed")}</Alert>
        )}
        {!playerId.trim() && (
          <Alert severity="info">{t("recommendations.specifyPlayer")}</Alert>
        )}
        {analysis.failedPlayers > 0 && (
          <Alert severity="warning">
            {t("recommendations.failedPlayers", {
              count: analysis.failedPlayers,
            })}
          </Alert>
        )}
        {analysis.failedMaps > 0 && (
          <Alert severity="warning">
            {t("recommendations.failedMaps", { count: analysis.failedMaps })}
          </Alert>
        )}
        {analysis.player?.stats.plusOnePP === null &&
          (analysis.phase === "done" || analysis.phase === "maps") && (
            <Alert severity="info">
              {t("recommendations.missingPlusOnePp")}
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
            onChange={(_, value: number) => {
              setActiveTab(value);
              trackEvent({
                event: "recommendation_tab_selected",
                recommendation_type: value === 0 ? "improvements" : "unplayed",
              });
            }}
            aria-label={t("recommendations.tabsLabel")}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              flexGrow: 1,
              minWidth: 0,
              minHeight: 40,
              "& .MuiTab-root": {
                minHeight: 40,
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
              label={`${t("recommendations.improveCandidates")} (${analysis.improvements.length})`}
              id="recommend-tab-0"
              aria-controls="recommend-panel-0"
            />
            <Tab
              label={`${t("recommendations.unplayedCandidates")} (${analysis.unplayed.length})`}
              id="recommend-tab-1"
              aria-controls="recommend-panel-1"
            />
          </Tabs>

          <PlaylistExportButton />
        </Box>

        {recommendations.length > 0 && (
          <Box
            role="group"
            aria-label={t("recommendations.filtersLabel")}
            sx={{
              border: 1,
              borderColor: "divider",
              px: { xs: 1.5, sm: 2 },
              py: 0.75,
            }}
          >
            <Stack spacing={1}>
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                sx={{ alignItems: "center", flexWrap: "wrap" }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t("recommendations.sortLabel")}
                </Typography>
                <Select
                  size="small"
                  value={sortKey}
                  onChange={(event: SelectChangeEvent<RecommendationSortKey>) =>
                    setSortKey(event.target.value)
                  }
                  aria-label={t("recommendations.sortLabel")}
                  sx={{ borderRadius: 0, fontSize: "0.8125rem" }}
                >
                  {sortOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                <Chip
                  size="small"
                  label={t("recommendations.groupSongs")}
                  clickable
                  color={groupBySong ? "primary" : "default"}
                  variant={groupBySong ? "filled" : "outlined"}
                  onClick={() => setGroupBySong((prev) => !prev)}
                  aria-pressed={groupBySong}
                  sx={{ borderRadius: 0 }}
                />
                {isViewModified && (
                  <Button
                    size="small"
                    onClick={resetView}
                    sx={{ borderRadius: 0, textTransform: "none" }}
                  >
                    {t("recommendations.reset")}
                  </Button>
                )}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: "auto" }}
                >
                  {view.items.length === recommendations.length
                    ? t("recommendations.count", {
                        count: recommendations.length,
                      })
                    : t("recommendations.countShown", {
                        total: recommendations.length,
                        shown: view.items.length,
                      })}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ whiteSpace: "nowrap" }}
                >
                  stars
                </Typography>
                <Slider
                  size="small"
                  value={effectiveStarsRange}
                  min={0}
                  max={sliderMax}
                  step={0.5}
                  onChange={(_, value) => {
                    const range = value as [number, number];
                    setStarsRange(
                      range[0] <= 0 && range[1] >= sliderMax ? null : range,
                    );
                  }}
                  valueLabelDisplay="auto"
                  aria-label="stars"
                  sx={{ maxWidth: 420 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {effectiveStarsRange[0].toFixed(1)} –{" "}
                  {effectiveStarsRange[1].toFixed(1)}
                </Typography>
              </Stack>
            </Stack>
          </Box>
        )}

        <Stack
          role="tabpanel"
          id={`recommend-panel-${activeTab}`}
          aria-labelledby={`recommend-tab-${activeTab}`}
          spacing={1.5}
        >
          <LayoutGroup>
            {view.groups.map((group) => {
              const expanded = expandedMapIds.has(group.mapId);
              return (
                <motion.div
                  key={group.head.leaderboard.id}
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
                  <Stack spacing={1.5}>
                    <MapRecommendationCard recommendation={group.head} />
                    {group.others.length > 0 && (
                      <>
                        <Button
                          size="small"
                          onClick={() => toggleGroup(group.mapId)}
                          aria-expanded={expanded}
                          sx={{
                            alignSelf: "flex-start",
                            borderRadius: 0,
                            textTransform: "none",
                          }}
                        >
                          {expanded
                            ? t("recommendations.collapseDifficulties")
                            : t("recommendations.otherDifficulties", {
                                count: group.others.length,
                              })}
                        </Button>
                        {expanded && (
                          <Stack
                            spacing={1.5}
                            sx={{
                              ml: { xs: 0.5, sm: 1 },
                              pl: { xs: 1.5, sm: 2.5 },
                              borderLeft: 1,
                              borderColor: "divider",
                            }}
                          >
                            {group.others.map((other) => (
                              <MapRecommendationCard
                                key={other.leaderboard.id}
                                recommendation={other}
                              />
                            ))}
                          </Stack>
                        )}
                      </>
                    )}
                  </Stack>
                </motion.div>
              );
            })}
          </LayoutGroup>

          {recommendations.length > 0 && view.items.length === 0 && (
            <AsciiPanel sx={{ py: 4, px: 2, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {t("recommendations.noFilteredResults")}
              </Typography>
              <Button
                size="small"
                onClick={resetView}
                sx={{ mt: 1, borderRadius: 0, textTransform: "none" }}
              >
                {t("recommendations.resetFilters")}
              </Button>
            </AsciiPanel>
          )}

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
            {t("recommendations.apiUsage", {
              count: analysis.apiCallCount,
              players: analysis.totalPlayers,
            })}
          </Typography>
        )}
      </Stack>
    </PlaylistExportProvider>
  );
};
