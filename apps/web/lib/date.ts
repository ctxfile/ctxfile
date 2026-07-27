/**
 * Formats a `YYYY-MM-DD` post date for display.
 *
 * Built from the parts rather than `new Date(iso)` on purpose: the string form
 * is parsed as UTC midnight, which renders as the *previous* day for every
 * reader west of Greenwich. Constructing from local components keeps the date
 * the author wrote.
 */
export function formatPostDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
