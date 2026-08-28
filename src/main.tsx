import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "yet-another-react-lightbox/styles.css";
import "react-photo-album/rows.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
