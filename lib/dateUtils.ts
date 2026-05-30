/**
 * Date normalization helpers used by the AI extraction routes.
 *
 * The model is instructed to return ISO `YYYY-MM-DD`, but OCR'd documents
 * frequently lead to other formats slipping through. We normalise on the
 * server so the rest of the app never has to deal with weird date strings.
 *
 * All helpers return a string (never throw) — an empty string means "could
 * not parse" and downstream code already treats that as "field absent".
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_NUMERIC_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;
const DMMMY_RE = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{2,4})$/;
const YMD_NUMERIC_RE = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function expandYear(y: number): number {
  if (y < 100) return y >= 70 ? 1900 + y : 2000 + y;
  return y;
}

function buildIso(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  // Validate via Date round-trip (catches Feb 30 etc.).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return '';
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Normalise a date string to `YYYY-MM-DD`, or return empty string if we
 * can't parse it. Numeric ambiguous formats are interpreted as DD/MM/YYYY
 * (Indian convention).
 */
export function normalizeDate(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  // Already ISO.
  const iso = raw.match(ISO_RE);
  if (iso) {
    return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // YYYY/MM/DD or YYYY-MM-DD with different separator.
  const ymd = raw.match(YMD_NUMERIC_RE);
  if (ymd) {
    return buildIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (Indian convention).
  const dmy = raw.match(DMY_NUMERIC_RE);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = expandYear(Number(dmy[3]));
    // If the first chunk is clearly > 12 it's day; if the second chunk is
    // > 12 we know order is MM/DD — but Indian docs almost always put day
    // first, so we default DD/MM/YYYY.
    if (m > 12 && d <= 12) {
      return buildIso(y, d, m);
    }
    return buildIso(y, m, d);
  }

  // DD MMM YYYY ("12 Jan 2026", "12-Jan-2026", "12th January, 2026").
  const stripped = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const dmmmy = stripped.match(DMMMY_RE);
  if (dmmmy) {
    const d = Number(dmmmy[1]);
    const mName = dmmmy[2].toLowerCase();
    const y = expandYear(Number(dmmmy[3]));
    const m = MONTHS[mName];
    if (m) return buildIso(y, m, d);
  }

  // MMM YYYY (no day) — fall back to the first of the month.
  const monthYearMatch = stripped.match(
    /^([A-Za-z]{3,9})[-\s,]+(\d{2,4})$/
  );
  if (monthYearMatch) {
    const m = MONTHS[monthYearMatch[1].toLowerCase()];
    const y = expandYear(Number(monthYearMatch[2]));
    if (m) return buildIso(y, m, 1);
  }

  // Last resort: Date.parse — but only accept if it produces a sensible
  // year (avoids "Invalid Date" giving NaN-NaN-NaN).
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    if (y >= 1900 && y <= 2100) {
      return buildIso(y, parsed.getMonth() + 1, parsed.getDate());
    }
  }

  return '';
}
