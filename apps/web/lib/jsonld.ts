/**
 * Serialise structured data for a `<script type="application/ld+json">` tag.
 *
 * JSON.stringify does not escape `<`, so a literal `</script>` anywhere in the
 * payload would close the tag early and spill the rest of the JSON into the
 * document. Our payloads come from files in this repo rather than from users,
 * but the escape costs nothing and removes the failure mode entirely.
 */
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
