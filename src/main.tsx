import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PPHuntPageV2 } from "./feature/scoresaber/components/PPHuntPageV2.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PPHuntPageV2 />
  </StrictMode>,
);
