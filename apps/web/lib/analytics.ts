/**
 * Dependency-free interaction tracking with two sinks:
 *
 * 1. Plausible, when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set at build time (see
 *    components/Analytics.tsx). Off by default.
 * 2. A first-party counter on ping.ctxfile.dev (apps/ping): a POST carrying
 *    only the event name and one short label, stored as a per-day count. No
 *    cookie, no identifier, no IP retained. Off in development and when
 *    NEXT_PUBLIC_SITE_EVENTS=off.
 *
 * Neither sink is required for the site to work: an unconfigured build makes
 * zero third-party requests, which is the same privacy posture the product
 * itself promises.
 */

type PlausibleProps = Record<string, string | number | boolean>;

interface PlausibleFn {
  (event: string, options?: { props?: PlausibleProps }): void;
  /** Queue the inline stub fills before the real script arrives. */
  q?: IArguments[];
}

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

const EVENT_ENDPOINT = "https://ping.ctxfile.dev/v1/event";

/** Maps the human event names used in components to the worker's closed set. */
const EVENT_KEYS: Record<string, string> = {
  "Setup command copied": "setup-copied",
  "Extension downloaded": "extension-downloaded",
  "Demo opened": "demo-opened",
  "Pricing CTA": "pricing-cta",
};

const SITE_EVENTS_ENABLED =
  process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_EVENTS !== "off";

function firstLabel(props?: PlausibleProps): string | undefined {
  if (!props) return undefined;
  const first = Object.values(props)[0];
  return first === undefined ? undefined : String(first);
}

/** Records a custom event. Silently does nothing when analytics is off. */
export function track(event: string, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break a user interaction.
  }
  const name = EVENT_KEYS[event];
  if (!SITE_EVENTS_ENABLED || name === undefined) return;
  try {
    const label = firstLabel(props);
    const body = JSON.stringify(label !== undefined ? { name, label } : { name });
    // sendBeacon survives the navigation a click usually triggers; fetch is
    // the fallback for browsers that lack it.
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(EVENT_ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(EVENT_ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
    }
  } catch {
    // Same rule: never break the interaction.
  }
}
