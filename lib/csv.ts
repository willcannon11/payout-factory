import { CsvRow } from './types';

const strip = (value: string) => value.replace(/^\s+|\s+$/g, '');

const parseNumber = (value: string) => {
  const cleaned = value.replace(/[$,]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const parseDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
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

export const parseNinjaCsv = (content: string): CsvRow[] => {
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
      time: parseDateTime(cols[index('Time')]),
      entryExit,
      commission: parseNumber(cols[index('Commission')]),
      account: cols[index('Account')],
      name: cols[index('Name')] || undefined,
      orderId: cols[index('Order ID')] || undefined
    });
  }
  return rows;
};
