import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PPHuntPageV2 } from "./feature/player-search/pages/PPHuntPageV2";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PPHuntPageV2 />
  </StrictMode>,
);
