import { Box } from "@mui/material";
import { PPHuntWordmarkV2 } from "../../player-search/components/PPHuntWordmarkV2";
import { designTokens } from "../../player-search/components/pphuntThemeV2";

interface MapRecommendHeaderProps {
  isDark: boolean;
}

export const MapRecommendHeader = ({ isDark }: MapRecommendHeaderProps) => (
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
);
