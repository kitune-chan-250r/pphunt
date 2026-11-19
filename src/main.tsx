import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PPHuntPage } from "./feature/scoresaber/components/PPHuntPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* <App /> */}
    <PPHuntPage />
  </StrictMode>,
);
