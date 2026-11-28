import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";
import { PPHuntPageV2 } from "./feature/player-search/pages/PPHuntPageV2";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <PPHuntPageV2 />
    </Suspense>
  </StrictMode>,
);
