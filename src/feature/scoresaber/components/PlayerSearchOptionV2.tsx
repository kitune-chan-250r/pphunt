import { Box, Stack } from "@mui/material";
import type { HTMLAttributes, Key } from "react";
import { CountryFlagV2 } from "./CountryFlagV2";
import { designTokens } from "./pphuntThemeV2";
import type { Player } from "../types/PlayerSearchResult";

export interface PlayerSearchOptionV2Props {
  props: HTMLAttributes<HTMLLIElement> & { key: Key };
  option: Player | string;
  isDark: boolean;
}

/**
 * Extracted option renderer for the Autocomplete list.
 * Shows avatar, name and country flag + rank, matching ScoreSaber's player rows.
 */
export const PlayerSearchOptionV2 = ({
  props,
  option,
  isDark,
}: PlayerSearchOptionV2Props) => {
  const { key, ...rest } = props;
  const player = typeof option === "string" ? null : option;

  return (
    <li key={key} {...rest}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        {player ? (
          <Box
            component="img"
            src={player.avatar}
            alt=""
            width={28}
            height={28}
            sx={{
              borderRadius: 8,
              flexShrink: 0,
              bgcolor: isDark
                ? designTokens.hairline.dark
                : designTokens.hairline.light,
            }}
          />
        ) : null}

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: "0.9375rem", fontWeight: 500 }}>
            {typeof option === "string" ? option : player?.name}
          </Box>

          {player ? (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 0.25, alignItems: "center", color: "text.secondary" }}
            >
              <CountryFlagV2 country={player.country} isDark={isDark} />
              <Box sx={{ fontSize: "0.75rem" }}>
                {player.country || "—"} · #{player.stats.rank}
              </Box>
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </li>
  );
};
