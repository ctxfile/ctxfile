import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { captureToken } from "./lib/token";
import "./styles.css";

// Capture the #token fragment and apply the persisted theme before first paint.
captureToken();
document.documentElement.dataset["theme"] =
  localStorage.getItem("cb-theme") === "light" ? "light" : "dark";

const container = document.getElementById("root");
if (container === null) throw new Error("missing #root element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
