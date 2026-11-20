import { Box, Container } from "@mui/material";
import { PPHuntWordmarkV2 } from "../../player-search/components/PPHuntWordmarkV2";
import { designTokens } from "../../player-search/components/pphuntThemeV2";

interface MapRecommendHeaderProps {
  isDark: boolean;
}

export const MapRecommendHeader = ({ isDark }: MapRecommendHeaderProps) => (
  <Box
    component="header"
    sx={{
      py: 1,
      borderBottom: `1px solid ${isDark ? designTokens.hairline.dark : designTokens.hairline.light}`,
    }}
  >
    <Container
      maxWidth="lg"
      disableGutters
      sx={{
        px: { xs: 2, sm: 3 },
        minHeight: 40,
        display: "flex",
        alignItems: "center",
      }}
    >
      <PPHuntWordmarkV2 isDark={isDark} variant="header" />
    </Container>
  </Box>
);
