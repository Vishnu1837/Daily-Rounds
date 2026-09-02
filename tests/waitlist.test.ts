import { describe, expect, it } from 'vitest';

import {
  WAITLIST_STATUS_LABELS,
  type WaitlistRow,
  matchesWaitlistQuery,
  waitlistCsvFilename,
  waitlistToCsv,
} from '@/lib/domain/waitlist';

function entry(overrides: Partial<WaitlistRow> = {}): WaitlistRow {
  return {
    id: 'entry-1',
    fullName: 'Anjali Rao',
    whatsapp: '+91 98765 43210',
    email: 'anjali@example.edu',
    mbbsYear: 2,
    university: 'Grant Medical College',
    challenge: 'Backlogs',
    status: 'new',
    note: null,
    createdAt: '2026-09-01T04:30:00.000Z',
    updatedAt: '2026-09-01T04:30:00.000Z',
    ...overrides,
  };
}

describe('waitlist status labels', () => {
  it('uses the words the admin console shows, not the stored enum values', () => {
    expect(WAITLIST_STATUS_LABELS.enrolled).toBe('Joined');
    expect(WAITLIST_STATUS_LABELS.declined).toBe('Not interested');
  });
});

describe('search', () => {
  it('matches on every field an admin reads the list by', () => {
    const row = entry();
    for (const query of ['anjali', 'RAO', '98765', 'example.edu', 'grant', 'backlog']) {
      expect(matchesWaitlistQuery(row, query)).toBe(true);
    }
  });

  it('does not match on a field that is absent', () => {
    expect(matchesWaitlistQuery(entry({ email: null }), 'example.edu')).toBe(false);
  });

  it('treats an empty query as "show everything"', () => {
    expect(matchesWaitlistQuery(entry(), '   ')).toBe(true);
  });
});

describe('CSV export', () => {
  it('writes a header and one row per entry', () => {
    const csv = waitlistToCsv([entry(), entry({ id: 'entry-2', fullName: 'Imran Qureshi' })]);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      '"Name","WhatsApp","Email","Year","College","Challenge","Status","Admin note","Submitted at"',
    );
    expect(lines[1]).toContain('"Anjali Rao"');
    expect(lines[2]).toContain('"Imran Qureshi"');
  });

  it('survives commas, quotes and newlines in the free-text answer', () => {
    const csv = waitlistToCsv([
      entry({ challenge: 'Backlogs, procrastination\nand a "system" that never sticks' }),
    ]);

    // The cell stays one cell: the newline is inside the quotes, and the inner quotes are
    // doubled rather than ending it early.
    expect(csv).toContain('"Backlogs, procrastination\nand a ""system"" that never sticks"');
  });

  it('stops a spreadsheet from reading a phone number as a formula', () => {
    const csv = waitlistToCsv([entry({ whatsapp: '+919876543210' })]);
    expect(csv).toContain(`"'+919876543210"`);
  });

  it('renders a missing optional field as an empty cell, not "null"', () => {
    const csv = waitlistToCsv([entry({ email: null, mbbsYear: null, note: null })]);
    expect(csv).not.toContain('null');
    expect(csv.split('\r\n')[1]).toContain('"","",');
  });

  it('exports the status label rather than the enum value', () => {
    expect(waitlistToCsv([entry({ status: 'enrolled' })])).toContain('"Joined"');
  });
});

describe('filename', () => {
  it('is dated and sortable', () => {
    expect(waitlistCsvFilename('2026-09-02')).toBe('daily-rounds-waitlist-2026-09-02.csv');
  });
});
