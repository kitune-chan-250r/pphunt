import {
  Avatar,
  Box,
  Card,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import type { MapRecommendation } from "../hooks/useMapRecommendations";

interface MapRecommendationCardProps {
  recommendation: MapRecommendation;
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

export const MapRecommendationCard = ({
  recommendation,
}: MapRecommendationCardProps) => {
  const { leaderboard, competitor, myScore, kind } = recommendation;
  const { map, difficulty, realm } = leaderboard;
  const title = `${map.songName}${map.songSubName ? ` ${map.songSubName}` : ""}`;

  return (
    <Card
      component="article"
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "60px minmax(0, 1fr)",
          sm: "76px minmax(0, 1fr) auto",
        },
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
        sx={{
          width: { xs: 60, sm: 76 },
          height: { xs: 60, sm: 76 },
          borderRadius: 2,
        }}
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
          sx={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
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
            <Chip
              size="small"
              variant="outlined"
              label={`${realm.stars.toFixed(2)} ★`}
            />
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
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: "primary.main" }}
        >
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
