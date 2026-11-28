import {
  Avatar,
  Box,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { AsciiPanel } from "../../../common/ascii/AsciiPanel";
import type { MapRecommendation } from "../hooks/useMapRecommendations";
import { trackEvent } from "../../../common/analytics/googleAnalytics";
import { useTranslation } from "react-i18next";

interface MapRecommendationCardProps {
  recommendation: MapRecommendation;
}

const numberFormat = new Intl.NumberFormat("en-US");

const formatScore = (score: number) => numberFormat.format(score);

const formatDifficulty = (difficulty: string) => {
  // ScoreSaber sometimes returns raw internal identifiers such as
  // "_ExpertPlus_SoloStandard" instead of a plain difficulty name.
  // Normalise those to the leading difficulty token before formatting.
  const normalized = difficulty.replace(/^_+/, "").split("_")[0];
  switch (normalized.toLowerCase()) {
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
      return normalized;
  }
};

const formatGameMode = (gameMode: string) => {
  // "SoloStandard" -> "Standard", "SoloNoArrows" -> "NoArrows", etc.
  return gameMode.startsWith("Solo") ? gameMode.slice("Solo".length) : gameMode;
};

const formatDifficultyLabel = (gameMode: string, rawDifficulty: string) => {
  const difficultyLabel = formatDifficulty(rawDifficulty);
  const modeLabel = formatGameMode(gameMode);
  // The standard mode is the default, so the difficulty alone is clearest.
  return modeLabel === "Standard" || modeLabel === ""
    ? difficultyLabel
    : `${modeLabel} / ${difficultyLabel}`;
};

export const MapRecommendationCard = ({
  recommendation,
}: MapRecommendationCardProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { leaderboard, competitor, myScore, kind, display } = recommendation;
  const { map, difficulty, realm } = leaderboard;
  const title = `${map.songName}${map.songSubName ? ` ${map.songSubName}` : ""}`;

  return (
    <AsciiPanel
      component="article"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "56px minmax(0, 1fr)",
          sm: "72px minmax(0, 1fr) 176px",
        },
        gap: { xs: 1.5, sm: 2.5 },
        alignItems: { xs: "start", sm: "center" },
        px: { xs: 1.5, sm: 2 },
        py: { xs: 1.5, sm: 2 },
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
          borderRadius: 0,
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
            onClick={() =>
              trackEvent({
                event: "leaderboard_opened",
                recommendation_type:
                  kind === "UNPLAYED" ? "unplayed" : "improvements",
              })
            }
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
            label={kind === "UNPLAYED" ? t("map.unplayed") : t("map.improvement")}
            color={kind === "UNPLAYED" ? "primary" : "default"}
            sx={{
              alignSelf: { xs: "flex-start", sm: "center" },
              height: 24,
              borderRadius: 0,
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
          {map.songAuthorName} ・{" "}
          {t("map.mapper", { name: map.levelAuthorName })}
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
            label={formatDifficultyLabel(
              difficulty.gameMode,
              difficulty.rawDifficulty,
            )}
            sx={{ borderRadius: 0 }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={t("map.nearbyPlayers", {
              count: recommendation.appearanceCount,
            })}
            sx={{ borderRadius: 0 }}
          />
          {display && display.recentPlayerCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={t("map.recentPlayers", {
                count: display.recentPlayerCount,
              })}
              sx={{ borderRadius: 0 }}
            />
          )}
          {display?.isAboveCurve && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={t("map.aboveCurve")}
              sx={{ borderRadius: 0 }}
            />
          )}
          {realm.stars > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${realm.stars.toFixed(2)} stars`}
              sx={{ borderRadius: 0 }}
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
          {t("map.referencePp")}
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
          {t("map.bestNearby", {
            score: formatScore(competitor.score.modifiedScore),
          })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {myScore
            ? t("map.myScore", {
                score: formatScore(myScore.modifiedScore),
              })
            : `${competitor.name} · #${numberFormat.format(competitor.rank)}`}
        </Typography>
        {display && (
          <>
            <Typography variant="caption" color="text.secondary">
              {t("map.predictedBestDelta", {
                value: display.predictedDeltaPpBest.toFixed(1),
              })}
            </Typography>
            {kind === "UNPLAYED" && (
              <Typography variant="caption" color="text.secondary">
                {t("map.predictedMedianDelta", {
                  value: display.predictedDeltaPpMedian.toFixed(1),
                })}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {t("map.predictedAccuracy", {
                value: (display.predictedAccuracy * 100).toFixed(1),
              })}
            </Typography>
          </>
        )}
      </Stack>
    </AsciiPanel>
  );
};
