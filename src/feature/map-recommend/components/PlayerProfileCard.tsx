import type { ReactNode } from "react";
import { Avatar, Box, Card, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CountryFlagV2 } from "../../player-search/components/CountryFlagV2";
import {
  ExternalLinkIconV2,
  ProfileIconV2,
  type ProfileIconKind,
} from "../../player-search/components/PPHuntIconsV2";
import type { PlayerProfile } from "../../scoresaber/types/ScoreSaber";

interface PlayerProfileCardProps {
  player: PlayerProfile;
}

const useProfileColors = () => {
  const { palette } = useTheme();
  const isDark = palette.mode === "dark";

  return {
    isDark,
    panel: palette.background.paper,
    surface: palette.background.default,
    border: palette.divider,
    text: palette.text.primary,
    secondary: palette.text.secondary,
    accent: isDark ? palette.primary.main : "#805b00",
    accentBorder: isDark ? "#665408" : "#c2a23b",
    rankSurface: isDark ? "#19180f" : "#fff8de",
    ppSurface: isDark ? "#211d0e" : "#fff3bf",
    positive: palette.success.main,
    negative: palette.error.main,
  };
};

type ProfileColors = ReturnType<typeof useProfileColors>;

const numberFormat = new Intl.NumberFormat("en-US");
const ppFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatRegistrationDate = (createdAt: string | undefined) => {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
};

const ProfileMetric = ({
  colors,
  icon,
  label,
  value,
}: {
  colors: ProfileColors;
  icon: ProfileIconKind;
  label: string;
  value: string;
}) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "16px minmax(0, 1fr) auto",
      columnGap: 0.75,
      alignItems: "center",
      minWidth: 0,
      minHeight: 34,
      px: 1,
      py: 0.75,
      border: `1px solid ${colors.border}`,
      borderRadius: "6px",
      bgcolor: colors.surface,
      color: colors.secondary,
    }}
  >
    <ProfileIconV2 kind={icon} size={15} />
    <Typography
      variant="caption"
      sx={{
        minWidth: 0,
        overflow: "hidden",
        color: colors.secondary,
        fontSize: "0.75rem",
        lineHeight: 1.2,
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Typography>
    <Typography
      component="span"
      sx={{
        color: colors.accent,
        fontSize: "0.8125rem",
        fontWeight: 500,
        lineHeight: 1.2,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Typography>
  </Box>
);

const RankBadge = ({
  colors,
  icon,
  label,
  value,
  change,
}: {
  colors: ProfileColors;
  icon: ReactNode;
  label: string;
  value: string;
  change?: number | null;
}) => (
  <Box
    role="group"
    aria-label={`${label} ${value}`}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      minWidth: 132,
      minHeight: 54,
      px: 1.25,
      py: 0.75,
      border: `1px solid ${colors.accentBorder}`,
      borderRadius: "8px",
      bgcolor: colors.rankSurface,
    }}
  >
    <Box sx={{ display: "flex", color: colors.secondary }}>{icon}</Box>
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <Typography
          component="span"
          sx={{
            color: colors.accent,
            fontSize: "1rem",
            fontWeight: 600,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
        {change !== undefined && change !== null && change !== 0 && (
          <Typography
            component="span"
            sx={{
              color: change > 0 ? colors.positive : colors.negative,
              fontSize: "0.75rem",
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {change > 0 ? "↑" : "↓"} {numberFormat.format(Math.abs(change))}
          </Typography>
        )}
      </Stack>
      <Typography
        variant="caption"
        sx={{ color: colors.secondary, fontSize: "0.6875rem", lineHeight: 1.2 }}
      >
        {label}
      </Typography>
    </Box>
  </Box>
);

const DeviceIcon = ({
  colors,
  kind,
  label,
}: {
  colors: ProfileColors;
  kind: "headset" | "controller";
  label: string;
}) => (
  <Box
    component="span"
    role="img"
    aria-label={label}
    title={label}
    sx={{
      width: 34,
      height: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: colors.secondary,
    }}
  >
    <ProfileIconV2 kind={kind} size={30} />
  </Box>
);

export const PlayerProfileCard = ({ player }: PlayerProfileCardProps) => {
  const colors = useProfileColors();
  const { device, rank, countryRank, rankChange } = player.stats;
  const metrics = [
    {
      icon: "trophy" as const,
      label: "ランクプレイ回数",
      value: numberFormat.format(player.stats.totalPlayedRankedLeaderboards),
    },
    {
      icon: "star" as const,
      label: "ランクスコア合計",
      value: numberFormat.format(Number(player.stats.totalRankedScore)),
    },
    {
      icon: "target" as const,
      label: "ランク平均精度",
      value: `${player.stats.averageAccuracy.toFixed(2)}%`,
    },
    {
      icon: "star" as const,
      label: "+1PP",
      value:
        player.stats.plusOnePP === null
          ? "—"
          : `${ppFormat.format(player.stats.plusOnePP)} PP`,
    },
    {
      icon: "gamepad" as const,
      label: "総プレイ回数",
      value: numberFormat.format(player.stats.totalPlayedLeaderboards),
    },
    {
      icon: "hash" as const,
      label: "スコア合計",
      value: numberFormat.format(Number(player.stats.totalScore)),
    },
    {
      icon: "calendar" as const,
      label: "登録日",
      value: formatRegistrationDate(player.createdAt),
    },
    {
      icon: "eye" as const,
      label: "リプレイ再生回数",
      value: numberFormat.format(player.stats.totalReplayViews),
    },
  ];

  return (
    <Card
      component="section"
      aria-label={`${player.name} のプレイヤープロフィール`}
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        color: colors.text,
        bgcolor: colors.panel,
        backgroundImage: "none",
        borderColor: colors.border,
        borderRadius: "10px",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "56px minmax(0, 1fr)", sm: "144px 1fr" },
          gap: { xs: 1.5, sm: 2 },
          alignItems: "start",
        }}
      >
        <Stack
          spacing={1}
          sx={{
            gridRow: { sm: "1 / span 3" },
            alignItems: "center",
            justifySelf: "center",
          }}
        >
          <Avatar
            src={player.avatar}
            alt={player.name}
            sx={{
              width: { xs: 56, sm: 112 },
              height: { xs: 56, sm: 112 },
              border: "2px solid",
              borderColor: colors.border,
              bgcolor: colors.surface,
            }}
          >
            {player.name.slice(0, 1)}
          </Avatar>
          {(player.followers !== undefined ||
            player.following !== undefined) && (
            <Stack
              direction="row"
              spacing={1}
              sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                whiteSpace: "nowrap",
              }}
            >
              {player.followers !== undefined && (
                <Typography
                  variant="caption"
                  sx={{ color: colors.text, fontSize: "0.6875rem" }}
                >
                  {numberFormat.format(player.followers)} フォロワー
                </Typography>
              )}
              {player.following !== undefined && (
                <Typography
                  variant="caption"
                  sx={{ color: colors.text, fontSize: "0.6875rem" }}
                >
                  {numberFormat.format(player.following)} フォロー
                </Typography>
              )}
            </Stack>
          )}
        </Stack>

        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              minHeight: 30,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ minWidth: 0, alignItems: "center" }}
            >
              <CountryFlagV2 country={player.country} isDark={colors.isDark} />
              <Typography
                component="a"
                aria-label={`${player.name} の ScoreSaber プロフィールを新しいタブで開く`}
                href={`https://scoresaber.com/u/${encodeURIComponent(player.id)}`}
                target="_blank"
                rel="noreferrer"
                sx={{
                  minWidth: 0,
                  overflow: "hidden",
                  color: colors.text,
                  fontSize: { xs: "1rem", sm: "1.25rem" },
                  fontWeight: 600,
                  lineHeight: 1.2,
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: colors.accent,
                    outlineOffset: 3,
                    borderRadius: "2px",
                  },
                }}
              >
                {player.name}
                <ExternalLinkIconV2 />
              </Typography>
            </Stack>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                border: `1px solid ${colors.accentBorder}`,
                borderRadius: "16px",
                bgcolor: colors.ppSurface,
              }}
            >
              <Typography
                component="span"
                sx={{
                  color: colors.accent,
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {ppFormat.format(player.stats.totalPP)}
              </Typography>
              <Typography
                component="span"
                sx={{ color: colors.accent, fontSize: "0.75rem" }}
              >
                PP
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <RankBadge
              colors={colors}
              icon={<ProfileIconV2 kind="globe" />}
              label="グローバル"
              value={`#${numberFormat.format(rank)}`}
              change={rankChange}
            />
            <RankBadge
              colors={colors}
              icon={<CountryFlagV2 country={player.country} isDark={colors.isDark} />}
              label={player.country || "国"}
              value={`#${numberFormat.format(countryRank)}`}
            />
            {(device?.hmd ||
              device?.controllerLeft ||
              device?.controllerRight) && (
              <Stack
                direction="row"
                spacing={0.5}
                role="group"
                aria-label="プレイデバイス"
              >
                {device.hmd && (
                  <DeviceIcon
                    colors={colors}
                    kind="headset"
                    label={`ヘッドセット ${device.hmd}`}
                  />
                )}
                {device.controllerLeft && (
                  <DeviceIcon
                    colors={colors}
                    kind="controller"
                    label={`左コントローラー ${device.controllerLeft}`}
                  />
                )}
                {device.controllerRight && (
                  <DeviceIcon
                    colors={colors}
                    kind="controller"
                    label={`右コントローラー ${device.controllerRight}`}
                  />
                )}
              </Stack>
            )}
          </Stack>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              display: { xs: "flex", sm: "none" },
              alignItems: "center",
              color: colors.secondary,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              グローバル{" "}
              <Box
                component="span"
                sx={{ color: colors.text, fontWeight: 500 }}
              >
                #{numberFormat.format(rank)}
              </Box>
            </Typography>
            {rankChange !== null && rankChange !== 0 && (
              <Typography
                component="span"
                variant="caption"
                sx={{
                  color: rankChange > 0 ? colors.positive : colors.negative,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {rankChange > 0 ? "↑" : "↓"}
                {numberFormat.format(Math.abs(rankChange))}
              </Typography>
            )}
            <Box
              component="span"
              aria-hidden="true"
              sx={{ width: "1px", height: 14, bgcolor: colors.border }}
            />
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: "center" }}
            >
              <CountryFlagV2 country={player.country} isDark={colors.isDark} />
              <Typography
                variant="caption"
                sx={{
                  color: colors.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                #{numberFormat.format(countryRank)}
              </Typography>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: { xs: "none", sm: "grid" },
              gridTemplateColumns: {
                sm: "repeat(2, minmax(0, 1fr))",
                md: "repeat(3, minmax(0, 1fr))",
                lg: "repeat(5, minmax(0, 1fr))",
              },
              gap: 1,
            }}
          >
            {metrics.map((metric) => (
              <ProfileMetric
                key={metric.label}
                colors={colors}
                icon={metric.icon}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </Box>
        </Stack>
      </Box>
    </Card>
  );
};
