/**
 * The waitlist, as the admin console sees it.
 *
 * Everything here is a pure function of the rows, so the CSV an admin downloads and the
 * table they are looking at cannot disagree about what an entry says — and so the escaping
 * rules below can be tested without a database.
 */

import type { WaitlistStatus } from '@/db/schema';

/**
 * The four states an enquiry moves through.
 *
 * The stored values are the ones the schema already shipped; the labels are the words the
 * brief uses. Keeping the mapping here rather than inlining strings in the table means the
 * CSV column and the status pill can never drift apart.
 */
export const WAITLIST_STATUSES: readonly WaitlistStatus[] = [
  'new',
  'contacted',
  'enrolled',
  'declined',
];

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  enrolled: 'Joined',
  declined: 'Not interested',
};

export const WAITLIST_STATUS_TONES: Record<
  WaitlistStatus,
  'pulse' | 'iris' | 'success' | 'neutral'
> = {
  new: 'pulse',
  contacted: 'iris',
  enrolled: 'success',
  declined: 'neutral',
};

export type WaitlistRow = {
  id: string;
  fullName: string;
  whatsapp: string;
  email: string | null;
  mbbsYear: number | null;
  university: string | null;
  challenge: string | null;
  status: WaitlistStatus;
  note: string | null;
  /** ISO instant — the moment the form was submitted. */
  createdAt: string;
  updatedAt: string;
};

/* --------------------------------------------------------------- filtering */

/**
 * Free-text search across the fields an admin actually reads a list by.
 *
 * The challenge text is included: "everyone who mentioned backlogs" is a real thing to want
 * to pull out of two hundred enquiries, and it costs nothing here.
 */
export function matchesWaitlistQuery(row: WaitlistRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.fullName, row.whatsapp, row.email, row.university, row.challenge].some((field) =>
    field ? field.toLowerCase().includes(q) : false,
  );
}

/* ------------------------------------------------------------------- export */

const CSV_COLUMNS = [
  'Name',
  'WhatsApp',
  'Email',
  'Year',
  'College',
  'Challenge',
  'Status',
  'Admin note',
  'Submitted at',
] as const;

/**
 * One CSV cell.
 *
 * Quoting is unconditional rather than "only when it contains a comma". A free-text
 * challenge field routinely holds commas, quotes and newlines all at once, and a rule that
 * only sometimes applies is the one that eventually gets a case wrong. The leading
 * apostrophe guard is for the WhatsApp number: `+919876543210` in a bare cell is read by
 * Excel and Sheets as a formula, and the admin opens the file to find `#NAME?`.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * The whole waitlist as a CSV file.
 *
 * Spreadsheets open a `.csv` happily, so this covers the brief's "CSV or Excel" without
 * shipping a workbook writer to do it. A UTF-8 BOM is prepended by the download itself so
 * Excel does not mangle non-ASCII names.
 */
export function waitlistToCsv(rows: readonly WaitlistRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => cell(c)).join(',')];

  for (const row of rows) {
    lines.push(
      [
        cell(row.fullName),
        cell(row.whatsapp),
        cell(row.email),
        cell(row.mbbsYear),
        cell(row.university),
        cell(row.challenge),
        cell(WAITLIST_STATUS_LABELS[row.status]),
        cell(row.note),
        cell(row.createdAt),
      ].join(','),
    );
  }

  // CRLF, which is what RFC 4180 asks for and what Excel is least surprised by.
  return lines.join('\r\n');
}

/** `daily-rounds-waitlist-2026-09-02.csv` — sortable, and obvious a month later. */
export function waitlistCsvFilename(today: string): string {
  return `daily-rounds-waitlist-${today}.csv`;
}
