import {
  Avatar,
  Box,
  Card,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
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
  const theme = useTheme();
  const { leaderboard, competitor, myScore, kind, prediction } = recommendation;
  const { map, difficulty, realm } = leaderboard;
  const title = `${map.songName}${map.songSubName ? ` ${map.songSubName}` : ""}`;

  return (
    <Card
      component="article"
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "56px minmax(0, 1fr)",
          sm: "72px minmax(0, 1fr) 176px",
        },
        gap: { xs: 1.5, sm: 2.5 },
        alignItems: { xs: "start", sm: "center" },
        p: { xs: 1.5, sm: 2 },
        bgcolor: "background.paper",
        borderColor: "divider",
        borderRadius: "14px",
        transition: "border-color 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        "&:hover": {
          borderColor: "text.disabled",
        },
      }}
    >
      <Avatar
        variant="rounded"
        src={map.coverUrl}
        alt=""
        sx={{
          width: { xs: 56, sm: 72 },
          height: { xs: 56, sm: 72 },
          borderRadius: "8px",
          bgcolor: "action.hover",
        }}
      />

      <Box sx={{ minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "center" }, mb: 0.5, minWidth: 0 }}
        >
          <Typography
            component="a"
            href={`https://scoresaber.com/leaderboard/${leaderboard.id}`}
            target="_blank"
            rel="noreferrer"
            sx={{
              color: "text.primary",
              textDecoration: "none",
              fontSize: "0.9375rem",
              lineHeight: 1.35,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              "&:hover": { textDecoration: "underline" },
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 3,
                borderRadius: "2px",
              },
            }}
          >
            {title}
          </Typography>
          <Chip
            size="small"
            label={kind === "UNPLAYED" ? "未プレイ" : "更新候補"}
            color={kind === "UNPLAYED" ? "primary" : "default"}
            sx={{
              alignSelf: { xs: "flex-start", sm: "center" },
              height: 24,
              borderRadius: "6px",
              "& .MuiChip-label": { px: 1 },
            }}
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
          sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}
        >
          <Chip
            size="small"
            variant="outlined"
            label={`${difficulty.gameMode} / ${formatDifficulty(difficulty.rawDifficulty)}`}
            sx={{ borderRadius: "6px" }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`周辺 ${recommendation.appearanceCount}人がプレイ`}
            sx={{ borderRadius: "6px" }}
          />
          {prediction?.sources.includes("SIMILAR") && (
            <Chip
              size="small"
              variant="outlined"
              color="primary"
              label="似たプレイヤー人気"
              sx={{ borderRadius: "6px" }}
            />
          )}
          {prediction?.sources.includes("CHALLENGE") && (
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              label="挑戦枠"
              sx={{ borderRadius: "6px" }}
            />
          )}
          {prediction?.highVariance && (
            <Chip
              size="small"
              variant="outlined"
              label="高分散"
              sx={{ borderRadius: "6px" }}
            />
          )}
          {realm.stars > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${realm.stars.toFixed(2)} stars`}
              sx={{ borderRadius: "6px" }}
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
          gridColumn: { xs: "1 / -1", sm: "auto" },
          justifySelf: { sm: "stretch" },
          textAlign: { sm: "right" },
          minWidth: 0,
          borderTop: { xs: 1, sm: 0 },
          borderLeft: { xs: 0, sm: 1 },
          borderColor: "divider",
          borderTopColor: "divider",
          borderLeftColor: "divider",
          pt: { xs: 1.5, sm: 0 },
          pl: { xs: 0, sm: 2 },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
        >
          参考 PP
        </Typography>
        <Typography
          component="p"
          sx={{
            fontSize: "1.375rem",
            lineHeight: 1.2,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            color: theme.palette.mode === "dark" ? "primary.main" : "#805b00",
          }}
        >
          {competitor.score.pp.toFixed(1)}
          <Typography
            component="span"
            sx={{ ml: 0.5, fontSize: "0.8125rem", color: "text.secondary" }}
          >
            PP
          </Typography>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          周辺最高: {formatScore(competitor.score.modifiedScore)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {myScore
            ? `自分: ${formatScore(myScore.modifiedScore)}`
            : `${competitor.name} · #${numberFormat.format(competitor.rank)}`}
        </Typography>
        {prediction && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.8 }}
            >
              予測 PP 増分
            </Typography>
            <Typography
              component="p"
              sx={{
                fontSize: "1.0625rem",
                lineHeight: 1.25,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              +{prediction.expectedDeltaPp.toFixed(1)}
              <Typography
                component="span"
                sx={{ ml: 0.5, fontSize: "0.75rem", color: "text.secondary" }}
              >
                PP（堅実見積もり +
                {Math.max(0, prediction.lcbDeltaPp).toFixed(1)}）
              </Typography>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              予測精度 {(prediction.predictedAccuracy * 100).toFixed(1)}% /
              予測 {prediction.predictedPp.toFixed(1)} PP
            </Typography>
          </>
        )}
      </Stack>
    </Card>
  );
};
