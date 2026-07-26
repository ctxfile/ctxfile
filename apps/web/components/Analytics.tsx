/**
 * Privacy-preserving page analytics (Plausible: no cookies, no cross-site
 * identifiers, no personal data — nothing that would need a consent banner).
 *
 * Entirely opt-in at build time. With NEXT_PUBLIC_PLAUSIBLE_DOMAIN unset this
 * renders nothing and the site makes zero third-party requests.
 *
 * NEXT_PUBLIC_PLAUSIBLE_SRC exists because this audience runs ad-blockers, and
 * blockers match on the vendor hostname. Serving the script from a first-party
 * path (e.g. "/js/p.js", proxied at the CDN edge to plausible.io) is the
 * ad-block-resistant setup. The site is a static export, so Next rewrites are
 * unavailable and that proxy has to live in the CDN — hence an explicit env
 * var rather than a default that would silently 404.
 */

const DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? "https://plausible.io/js/script.outbound-links.js";

/**
 * Buffers events fired before the script finishes loading, so a fast click on
 * the hero copy button is not lost. This is Plausible's documented stub.
 */
const QUEUE_STUB =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}";

export function Analytics() {
  if (!DOMAIN) return null;
  return (
    <>
      <script defer data-domain={DOMAIN} src={SRC} />
      <script dangerouslySetInnerHTML={{ __html: QUEUE_STUB }} />
    </>
  );
}
