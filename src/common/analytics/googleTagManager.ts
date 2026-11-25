import TagManager from "react-gtm-module";

type AnalyticsEvent =
  | {
      event: "page_view";
      page_location: string;
      page_title: string;
    }
  | {
      event: "player_search";
      status: "success" | "error";
      query_length_bucket: "3-5" | "6-10" | "11+";
      result_count: number;
    }
  | {
      event: "player_selected";
    }
  | {
      event: "recommendation_analysis_started";
    }
  | {
      event: "recommendation_analysis_completed";
      analysis_duration_ms: number;
      improvement_count: number;
      unplayed_count: number;
      failed_players: number;
      failed_maps: number;
      api_call_count: number;
    }
  | {
      event: "recommendation_analysis_failed";
      analysis_duration_ms: number;
    }
  | {
      event: "recommendation_tab_selected";
      recommendation_type: "improvements" | "unplayed";
    }
  | {
      event: "leaderboard_opened";
      recommendation_type: "improvements" | "unplayed";
    }
  | {
      event: "playlist_export";
      status: "success" | "partial" | "failure";
      song_count: number;
      lookup_failure_count: number;
    };

const GTM_ID = "GTM-WTQF7J38";
let initialized = false;

export const getQueryLengthBucket = (
  query: string,
): "3-5" | "6-10" | "11+" => {
  if (query.length <= 5) return "3-5";
  if (query.length <= 10) return "6-10";
  return "11+";
};

export const trackEvent = (event: AnalyticsEvent) => {
  if (!initialized) return;
  TagManager.dataLayer({ dataLayer: event });
};

export const initializeAnalytics = () => {
  if (!import.meta.env.PROD || initialized) return;

  TagManager.initialize({ gtmId: GTM_ID });
  initialized = true;
  trackEvent({
    event: "page_view",
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_title: document.title,
  });
};
