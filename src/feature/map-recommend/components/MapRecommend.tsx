import { useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  Chip,
  Container,
  CssBaseline,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { SpinnerV2 } from "../../player-search/components/PPHuntIconsV2";
import { PPHuntWordmarkV2 } from "../../player-search/components/PPHuntWordmarkV2";
import {
  createPPHuntThemeV2,
  designTokens,
} from "../../player-search/components/pphuntThemeV2";
import type { MapRecommendation } from "../hooks/useMapRecommendations";
import { useMapRecommendations } from "../hooks/useMapRecommendations";

interface MapRecommendProps {
  playerId: string;
}

const numberFormat = new Intl.NumberFormat("en-US");

const formatScore = (score: number) => numberFormat.format(score);

const formatDifficulty = (difficulty: string) => {
  switch (difficulty.toLowerCase()) {
    case "easy":
      return "Easy";
    case "normal":
      return "Normal";
    case "hard":
      return "Hard";
    case "expert":
      return "Expert";
    case "expertplus":
      return "Expert+";
    default:
      return difficulty;
  }
};

const RecommendationCard = ({
  recommendation,
}: {
  recommendation: MapRecommendation;
}) => {
  const { leaderboard, competitor, myScore, kind } = recommendation;
  const { map, difficulty, realm } = leaderboard;
  const title = `${map.songName}${map.songSubName ? ` ${map.songSubName}` : ""}`;

  return (
    <Card
      component="article"
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "60px minmax(0, 1fr)", sm: "76px minmax(0, 1fr) auto" },
        gap: { xs: 1.5, sm: 2 },
        alignItems: "center",
        p: { xs: 1.25, sm: 1.75 },
        bgcolor: "background.paper",
        borderColor: "divider",
        transition: "border-color 150ms ease, transform 150ms ease",
        "&:hover": {
          borderColor: "primary.main",
          transform: "translateY(-1px)",
        },
      }}
    >
      <Avatar
        variant="rounded"
        src={map.coverUrl}
        alt=""
        sx={{ width: { xs: 60, sm: 76 }, height: { xs: 60, sm: 76 }, borderRadius: 2 }}
      />

      <Box sx={{ minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={0.75}
          sx={{ alignItems: { sm: "center" }, mb: 0.35 }}
        >
          <Typography
            component="a"
            href={`https://scoresaber.com/leaderboard/${leaderboard.id}`}
            target="_blank"
            rel="noreferrer"
            sx={{
              color: "text.primary",
              textDecoration: "none",
              fontSize: "1rem",
              lineHeight: 1.35,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              "&:hover": { color: "primary.main" },
            }}
          >
            {title}
          </Typography>
          <Chip
            size="small"
            label={kind === "UNPLAYED" ? "未プレイ" : "更新候補"}
            color={kind === "UNPLAYED" ? "primary" : "default"}
            sx={{ alignSelf: { xs: "flex-start", sm: "center" }, height: 22 }}
          />
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {map.songAuthorName} ・ マップ: {map.levelAuthorName}
        </Typography>

        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}
        >
          <Chip
            size="small"
            variant="outlined"
            label={`${difficulty.gameMode} / ${formatDifficulty(difficulty.rawDifficulty)}`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`周辺 ${recommendation.appearanceCount}人がプレイ`}
          />
          {realm.stars > 0 && (
            <Chip size="small" variant="outlined" label={`${realm.stars.toFixed(2)} ★`} />
          )}
          {map.bpm > 0 && (
            <Typography variant="caption" color="text.secondary">
              {numberFormat.format(map.bpm)} BPM
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {realm.leaderboardStatus}
          </Typography>
        </Stack>
      </Box>

      <Stack
        spacing={0.4}
        sx={{
          gridColumn: { xs: "2", sm: "auto" },
          justifySelf: "start",
          textAlign: "left",
          minWidth: { sm: 160 },
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
          参考 {competitor.score.pp.toFixed(1)} PP
        </Typography>
        <Typography variant="caption" color="text.secondary">
          周辺最高: {formatScore(competitor.score.modifiedScore)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {myScore
            ? `自分: ${formatScore(myScore.modifiedScore)}`
            : `${competitor.name} · #${numberFormat.format(competitor.rank)}`}
        </Typography>
      </Stack>
    </Card>
  );
};

export const MapRecommend = ({ playerId }: MapRecommendProps) => {
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () => createPPHuntThemeV2(prefersDarkMode ? "dark" : "light"),
    [prefersDarkMode],
  );
  const [activeTab, setActiveTab] = useState(0);
  const analysis = useMapRecommendations(playerId);
  const isDark = prefersDarkMode;
  const recommendations =
    activeTab === 0 ? analysis.unplayed : analysis.improvements;
  const isActive = analysis.isLoading;
  const progressValue =
    analysis.phase === "scores" && analysis.totalPlayers > 0
      ? (analysis.completedPlayers / analysis.totalPlayers) * 100
      : analysis.phase === "maps" && analysis.totalMaps > 0
        ? (analysis.checkedMaps / analysis.totalMaps) * 100
        : undefined;

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
        <Box
          component="header"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 1.5,
            borderBottom: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
          }}
        >
          <PPHuntWordmarkV2 isDark={isDark} variant="header" />
        </Box>

        <Container maxWidth="md" component="main" sx={{ py: { xs: 4, sm: 6 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: "-0.03em" }}>
                周辺プレイヤーの譜面を分析
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                近いGlobal Rankのプレイヤーのトップスコアから、次に挑戦する譜面を探します。
              </Typography>
            </Box>

            {analysis.player && (
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
                    {isActive && <SpinnerV2 size={16} />}
                    <Typography variant="body2" color="text.secondary" role="status">
                      {analysis.phase === "scores"
                        ? `プレイヤースコア取得中 ${analysis.completedPlayers}/${analysis.totalPlayers}`
                        : analysis.phase === "maps"
                          ? `譜面のプレイ状況を確認中 ${analysis.checkedMaps}/${analysis.totalMaps}`
                          : analysis.phase === "done"
                            ? "分析完了"
                            : "準備中"}
                    </Typography>
                  </Stack>
                </Stack>
                {isActive && (
                  <LinearProgress
                    variant={progressValue === undefined ? "indeterminate" : "determinate"}
                    value={progressValue}
                    sx={{ mt: 1.5, borderRadius: 4, height: 4 }}
                  />
                )}
              </Card>
            )}

            {analysis.error && <Alert severity="error">{analysis.error}</Alert>}
            {!playerId.trim() && (
              <Alert severity="info">プレイヤーIDを指定すると分析を開始します。</Alert>
            )}
            {analysis.failedPlayers > 0 && (
              <Alert severity="warning">
                {analysis.failedPlayers}人分のスコアを取得できませんでした。取得できたデータで分析を続けています。
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
                  ScoreSaberから plusOnePP が提供されていないため、未プレイ譜面のPP条件を判定できません。スコア更新候補は引き続き表示します。
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
                <RecommendationCard
                  key={recommendation.leaderboard.id}
                  recommendation={recommendation}
                />
              ))}

              {recommendations.length === 0 && !analysis.error && (
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
                  {isActive ? (
                    <Stack spacing={1.5} sx={{ alignItems: "center" }}>
                      <SpinnerV2 size={22} />
                      <Typography variant="body2" color="text.secondary">
                        スコアを集めながら候補を解析しています…
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {analysis.phase === "done"
                        ? activeTab === 0
                          ? "条件に合う未プレイ譜面は見つかりませんでした。"
                          : "周辺プレイヤーより高いスコアの譜面は見つかりませんでした。"
                        : "分析を開始しています…"}
                    </Typography>
                  )}
                </Box>
              )}
            </Stack>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
};
