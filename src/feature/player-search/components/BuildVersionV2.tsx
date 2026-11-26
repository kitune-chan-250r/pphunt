import { Box, Typography } from "@mui/material";
import { BUILD_INFO } from "../../../common/buildInfo";

/**
 * Build identifier (version · commit · build date) as a single quiet line
 * at the very bottom of the page, in the theme's smallest secondary style.
 */
export const BuildVersionV2 = () => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        px: 2,
        py: 1.5,
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {BUILD_INFO}
      </Typography>
    </Box>
  );
};
