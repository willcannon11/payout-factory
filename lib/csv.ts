import { CsvRow } from './types';

const strip = (value: string) => value.replace(/^\s+|\s+$/g, '');

const parseNumber = (value: string) => {
  const cleaned = value.replace(/[$,]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit'
  }).formatToParts(date);
  const offsetLabel = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = offsetLabel.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match?.groups?.sign || !match.groups.hours) {
    return 0;
  }

  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes ?? '0');
  const totalMinutes = hours * 60 + minutes;
  return match.groups.sign === '-' ? -totalMinutes : totalMinutes;
};

const parseDateTime = (value: string, timeZone: string) => {
  const match = value.match(
    /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4}) (?<hour>\d{1,2}):(?<minute>\d{2}):(?<second>\d{2}) (?<meridiem>AM|PM)$/i
  );

  if (!match?.groups) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }

  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const year = Number(match.groups.year);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const meridiem = match.groups.meridiem.toUpperCase();
  let hour = Number(match.groups.hour) % 12;
  if (meridiem === 'PM') {
    hour += 12;
  }

  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  }

  return new Date(utcGuess);
};

const splitCsvLine = (line: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(strip);
};

export const parseNinjaCsv = (content: string, timeZone = 'America/Chicago'): CsvRow[] => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  const header = splitCsvLine(lines[0]);
  const index = (name: string) => header.indexOf(name);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const action = cols[index('Action')] as 'Buy' | 'Sell';
    const entryExit = cols[index('E/X')] as 'Entry' | 'Exit';
    if (!action || !entryExit) {
      continue;
    }
    rows.push({
      instrument: cols[index('Instrument')],
      action,
      quantity: parseNumber(cols[index('Quantity')]),
      price: parseNumber(cols[index('Price')]),
      time: parseDateTime(cols[index('Time')], timeZone),
      entryExit,
      commission: parseNumber(cols[index('Commission')]),
      account: cols[index('Account')],
      name: cols[index('Name')] || undefined,
      orderId: cols[index('Order ID')] || undefined
    });
  }
  return rows;
};
