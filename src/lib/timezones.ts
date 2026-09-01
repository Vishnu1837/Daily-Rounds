/**
 * The timezones a Daily Rounds student can be in.
 *
 * Stored as IANA identifiers, shown as friendly place labels. The brief is explicit about
 * why the two are kept apart: several of the countries in the cohort — Russia and
 * Kazakhstan in particular — span multiple zones, so storing "Russia" would be ambiguous
 * about what time a session actually starts. The label is for humans; the identifier is the
 * only thing that ever reaches the database or a date calculation.
 *
 * Grouped by region so the picker is scannable rather than a flat list of 30 strings.
 */

export type TimezoneOption = {
  /** IANA identifier — what is stored, and what date-fns-tz is given. */
  id: string;
  /** What the student sees. */
  label: string;
};

export type TimezoneGroup = {
  region: string;
  zones: TimezoneOption[];
};

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    region: 'South Asia',
    zones: [
      { id: 'Asia/Kolkata', label: 'India (Delhi, Mumbai, Chennai)' },
      { id: 'Asia/Karachi', label: 'Pakistan (Karachi)' },
      { id: 'Asia/Dhaka', label: 'Bangladesh (Dhaka)' },
      { id: 'Asia/Kathmandu', label: 'Nepal (Kathmandu)' },
      { id: 'Asia/Colombo', label: 'Sri Lanka (Colombo)' },
    ],
  },
  {
    region: 'Central Asia & Caucasus',
    zones: [
      { id: 'Asia/Tashkent', label: 'Uzbekistan (Tashkent)' },
      { id: 'Asia/Samarkand', label: 'Uzbekistan (Samarkand)' },
      { id: 'Asia/Bishkek', label: 'Kyrgyzstan (Bishkek)' },
      { id: 'Asia/Dushanbe', label: 'Tajikistan (Dushanbe)' },
      { id: 'Asia/Tbilisi', label: 'Georgia (Tbilisi)' },
      { id: 'Asia/Yerevan', label: 'Armenia (Yerevan)' },
      { id: 'Asia/Baku', label: 'Azerbaijan (Baku)' },
    ],
  },
  {
    // Kazakhstan runs two zones since 2024; both are offered rather than picking one.
    region: 'Kazakhstan',
    zones: [
      { id: 'Asia/Almaty', label: 'Kazakhstan — east (Almaty, Astana)' },
      { id: 'Asia/Aqtobe', label: 'Kazakhstan — west (Aqtobe, Atyrau)' },
    ],
  },
  {
    // Russia spans eleven zones. These are the ones with medical universities that
    // international students actually attend.
    region: 'Russia',
    zones: [
      { id: 'Europe/Kaliningrad', label: 'Russia — Kaliningrad' },
      { id: 'Europe/Moscow', label: 'Russia — Moscow, St Petersburg' },
      { id: 'Europe/Samara', label: 'Russia — Samara' },
      { id: 'Asia/Yekaterinburg', label: 'Russia — Yekaterinburg, Ufa' },
      { id: 'Asia/Omsk', label: 'Russia — Omsk' },
      { id: 'Asia/Novosibirsk', label: 'Russia — Novosibirsk' },
      { id: 'Asia/Krasnoyarsk', label: 'Russia — Krasnoyarsk' },
      { id: 'Asia/Irkutsk', label: 'Russia — Irkutsk' },
      { id: 'Asia/Vladivostok', label: 'Russia — Vladivostok' },
    ],
  },
  {
    region: 'Middle East',
    zones: [
      { id: 'Asia/Dubai', label: 'UAE (Dubai, Abu Dhabi)' },
      { id: 'Asia/Riyadh', label: 'Saudi Arabia (Riyadh)' },
      { id: 'Asia/Qatar', label: 'Qatar (Doha)' },
      { id: 'Asia/Kuwait', label: 'Kuwait' },
      { id: 'Asia/Bahrain', label: 'Bahrain' },
      { id: 'Asia/Muscat', label: 'Oman (Muscat)' },
    ],
  },
  {
    region: 'Africa',
    zones: [
      { id: 'Africa/Cairo', label: 'Egypt (Cairo)' },
      { id: 'Africa/Lagos', label: 'Nigeria (Lagos)' },
      { id: 'Africa/Nairobi', label: 'Kenya (Nairobi)' },
      { id: 'Africa/Khartoum', label: 'Sudan (Khartoum)' },
    ],
  },
  {
    region: 'East & Southeast Asia',
    zones: [
      { id: 'Asia/Ho_Chi_Minh', label: 'Vietnam (Ho Chi Minh City, Hanoi)' },
      { id: 'Asia/Manila', label: 'Philippines (Manila)' },
      { id: 'Asia/Shanghai', label: 'China (Beijing, Shanghai)' },
      { id: 'Asia/Kuala_Lumpur', label: 'Malaysia (Kuala Lumpur)' },
    ],
  },
  {
    region: 'Europe & Americas',
    zones: [
      { id: 'Europe/London', label: 'United Kingdom (London)' },
      { id: 'Europe/Dublin', label: 'Ireland (Dublin)' },
      { id: 'Europe/Berlin', label: 'Germany (Berlin)' },
      { id: 'America/New_York', label: 'USA — Eastern (New York)' },
      { id: 'America/Chicago', label: 'USA — Central (Chicago)' },
      { id: 'America/Los_Angeles', label: 'USA — Pacific (Los Angeles)' },
      { id: 'America/Toronto', label: 'Canada — Eastern (Toronto)' },
      { id: 'Australia/Sydney', label: 'Australia — Eastern (Sydney)' },
      { id: 'UTC', label: 'UTC' },
    ],
  },
];

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Every offered zone, flattened. */
export const TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap((g) => g.zones);

const labelById = new Map(TIMEZONES.map((z) => [z.id, z.label]));

/**
 * The friendly label for a stored identifier.
 *
 * Falls back to a readable form of the identifier itself rather than to the default zone: a
 * student whose stored zone is not on our list is still in that zone, and silently
 * relabelling them "India" would be worse than showing "Asia/Yakutsk".
 */
export function timezoneLabel(id: string): string {
  return labelById.get(id) ?? id.replace(/_/g, ' ').replace('/', ' — ');
}

/** Whether an identifier is one we offer. */
export function isKnownTimezone(id: string): boolean {
  return labelById.has(id);
}

/**
 * Formats a `HH:mm` wall-clock time from the cohort's zone into the student's own.
 *
 * Session times are stored as a plain time against the cohort's timezone, so rendering one
 * for a student in Tashkent means anchoring it to a real date first — the offset between
 * two zones is not constant across the year, and only a specific instant can resolve it.
 */
export function formatTimeInZone(
  time: string,
  isoDate: string,
  fromZone: string,
  toZone: string,
): string {
  if (fromZone === toZone) return time;

  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours)) return time;

  // Find the UTC instant whose wall-clock reading in `fromZone` is the given date and time.
  const guess = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    hours,
    minutes,
  );
  const offset = zoneOffsetMs(new Date(guess), fromZone);
  const instant = new Date(guess - offset);

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: toZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

/** How far `zone` is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // `hour` can come back as 24 for midnight in some engines; Date.UTC normalises it.
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - at.getTime();
}
