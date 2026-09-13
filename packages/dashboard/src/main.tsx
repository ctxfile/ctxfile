import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { captureToken } from "./lib/token";
import "./styles.css";

/**
 * Demo build (ctxfile.dev/demo): the API is answered in-page from fixtures so
 * the real dashboard can be explored without installing anything. The flag is
 * baked in at build time; a normal `ctxfile ui` build never includes the mock.
 */
const DEMO = import.meta.env["VITE_DEMO"] === "1";

async function boot(): Promise<void> {
  let requestedView: string | null = null;
  if (DEMO) {
    const { installMockServer } = await import("./demo/mockServer");
    installMockServer();
    // Keep a deep link like /demo/#/playbooks: the token capture below strips
    // the whole fragment, so the view part is restored afterwards.
    const fragment = window.location.hash.replace(/^#/, "");
    if (fragment.startsWith("/")) requestedView = fragment;
    if (!/[#&]token=/.test(window.location.hash)) window.location.hash = "#token=demo";
    document.documentElement.dataset["demo"] = "true";
  }

  // Capture the #token fragment and apply the persisted theme before first paint.
  captureToken();
  if (requestedView !== null) window.history.replaceState(null, "", `#${requestedView}`);
  document.documentElement.dataset["theme"] = localStorage.getItem("cb-theme") === "light" ? "light" : "dark";

  const container = document.getElementById("root");
  if (container === null) throw new Error("missing #root element");

  createRoot(container).render(
    <StrictMode>
      <App demo={DEMO} />
    </StrictMode>
  );
}

void boot();
