import { Avatar, Box, Divider, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CountryFlagV2 } from "../../player-search/components/CountryFlagV2";
import { ExternalLinkIconV2 } from "../../player-search/components/PPHuntIconsV2";
import { AsciiPanel } from "../../../common/ascii/AsciiPanel";
import type { PlayerProfile } from "../../scoresaber/types/ScoreSaber";

interface PlayerProfileCardProps {
  player: PlayerProfile;
}

const numberFormat = new Intl.NumberFormat("en-US");
const ppFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const PlayerProfileCard = ({ player }: PlayerProfileCardProps) => {
  const { palette } = useTheme();
  const isDark = palette.mode === "dark";
  const accent = isDark ? palette.primary.light : "#805b00";
  const { rank, countryRank, rankChange, averageAccuracy, plusOnePP } =
    player.stats;
  const metrics = [
    {
      label: "グローバル順位",
      value: `#${numberFormat.format(rank)}`,
      change: rankChange,
    },
    {
      label: `${player.country || "国"}順位`,
      value: `#${numberFormat.format(countryRank)}`,
    },
    {
      label: "平均精度",
      value: `${averageAccuracy.toFixed(2)}%`,
    },
    {
      label: "+1PP",
      value: plusOnePP === null ? "—" : `${ppFormat.format(plusOnePP)} PP`,
    },
  ];

  return (
    <AsciiPanel
      component="section"
      ariaLabel={`${player.name} のプレイヤープロフィール`}
      title="PLAYER"
      sx={{ color: "text.primary" }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: { xs: 1.5, sm: 2 },
          alignItems: "center",
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ minWidth: 0, alignItems: "center" }}
        >
          <Avatar
            src={player.avatar}
            alt={player.name}
            variant="rounded"
            sx={{
              width: { xs: 48, sm: 56 },
              height: { xs: 48, sm: 56 },
              borderRadius: 0,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.default",
            }}
          >
            {player.name.slice(0, 1)}
          </Avatar>
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ minWidth: 0, alignItems: "center" }}
            >
              <CountryFlagV2 country={player.country} isDark={isDark} />
              <Typography
                component="a"
                aria-label={`${player.name} の ScoreSaber プロフィールを新しいタブで開く`}
                href={`https://scoresaber.com/u/${encodeURIComponent(player.id)}`}
                target="_blank"
                rel="noreferrer"
                sx={{
                  minWidth: 0,
                  overflow: "hidden",
                  color: "text.primary",
                  fontSize: { xs: "1rem", sm: "1.125rem" },
                  fontWeight: 600,
                  lineHeight: 1.25,
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: accent,
                    outlineOffset: 3,
                    borderRadius: "2px",
                  },
                }}
              >
                {player.name}
                <ExternalLinkIconV2 />
              </Typography>
            </Stack>
          </Stack>
        </Stack>

        <Box sx={{ textAlign: "right" }}>
          <Typography
            component="div"
            variant="caption"
            sx={{ color: "text.secondary", lineHeight: 1.2 }}
          >
            合計PP
          </Typography>
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: "baseline", justifyContent: "flex-end" }}
          >
            <Typography
              component="span"
              sx={{
                color: accent,
                fontSize: { xs: "1.5rem", sm: "1.875rem" },
                fontWeight: 600,
                lineHeight: 1.1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ppFormat.format(player.stats.totalPP)}
            </Typography>
            <Typography
              component="span"
              sx={{ color: accent, fontSize: "0.875rem", fontWeight: 500 }}
            >
              PP
            </Typography>
          </Stack>
        </Box>
      </Box>

      <Divider sx={{ my: 1.5, borderColor: "divider" }} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(4, minmax(0, 1fr))",
          },
          columnGap: { xs: 1.5, sm: 2 },
          rowGap: 1.5,
        }}
      >
        {metrics.map((metric) => (
          <Box key={metric.label} sx={{ minWidth: 0 }}>
            <Typography
              component="div"
              variant="caption"
              sx={{
                mb: 0.25,
                color: "text.secondary",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {metric.label}
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography
                component="span"
                sx={{
                  color: "text.primary",
                  fontSize: "0.9375rem",
                  fontWeight: 500,
                  lineHeight: 1.25,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {metric.value}
              </Typography>
              {metric.change !== undefined &&
                metric.change !== null &&
                metric.change !== 0 && (
                  <Typography
                    component="span"
                    sx={{
                      color:
                        metric.change > 0
                          ? palette.success.main
                          : palette.error.main,
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {metric.change > 0 ? "↑" : "↓"}
                    {numberFormat.format(Math.abs(metric.change))}
                  </Typography>
                )}
            </Stack>
          </Box>
        ))}
      </Box>
    </AsciiPanel>
  );
};
