import { Box, Stack, useMediaQuery } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import { AnalysisProgressCard } from "./AnalysisProgressCard";
import { RecommendationResults } from "./RecommendationResults";
import { useMapRecommendations } from "../hooks/useMapRecommendations";

interface MapRecommendProps {
  playerId: string;
}

export const MapRecommend = ({ playerId }: MapRecommendProps) => {
  const isMobile = useMediaQuery("(max-width:599.95px)");
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const riseDistance = shouldAnimate ? (isMobile ? 8 : 12) : 0;
  const entranceEase = [0.22, 1, 0.36, 1] as const;
  const analysis = useMapRecommendations(playerId);

  return (
    <Box
      component="section"
      aria-label="譜面のおすすめ"
      sx={{ color: "text.primary" }}
    >
      <Stack spacing={{ xs: 1.5, sm: 1.5 }} sx={{ py: { xs: 1.5, sm: 1.5 } }}>
        {/* <motion.div
          initial={shouldAnimate ? { opacity: 0, y: riseDistance } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldAnimate ? 0.8 : 0,
            ease: entranceEase,
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: "1.625rem", sm: "1.875rem" },
              fontWeight: 500,
              lineHeight: 1.25,
            }}
          >
            周辺プレイヤーの譜面を分析
          </Typography>
        </motion.div> */}

        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: riseDistance } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{
            duration: shouldAnimate ? 1 : 0,
            delay: shouldAnimate ? 0.1 : 0,
            ease: entranceEase,
          }}
        >
          <AnalysisProgressCard analysis={analysis} />
        </motion.div>
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: riseDistance } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0 }}
          transition={{
            duration: shouldAnimate ? 1 : 0,
            delay: shouldAnimate ? 0.1 : 0,
            ease: entranceEase,
          }}
        >
          <RecommendationResults
            key={playerId}
            analysis={analysis}
            playerId={playerId}
          />
        </motion.div>
      </Stack>
    </Box>
  );
};
