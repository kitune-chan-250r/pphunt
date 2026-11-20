import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MapRecommend } from "./feature/map-recommend/components/MapRecommend";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MapRecommend playerId="76561198152408857" />
  </StrictMode>,
);
