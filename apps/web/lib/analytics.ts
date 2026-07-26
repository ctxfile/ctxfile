/**
 * A dependency-free wrapper over the Plausible event queue.
 *
 * Every call is a no-op unless the analytics script is loaded, and the script
 * only loads when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set at build time. That lets
 * components carry instrumentation without depending on analytics being
 * configured at all: an unconfigured build ships zero third-party requests,
 * which is the same privacy posture the product itself promises.
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

/** Records a custom event. Silently does nothing when analytics is off. */
export function track(event: string, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break a user interaction.
  }
}
