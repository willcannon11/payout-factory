import { CsvRow, Trade } from './types';

const POINT_VALUE_MAP: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  SIL: 1000
};

const instrumentKey = (instrument: string) => instrument.split(' ')[0] || instrument;

const pointValueFor = (instrument: string) => {
  const key = instrumentKey(instrument).toUpperCase();
  return POINT_VALUE_MAP[key] ?? 1;
};

type OpenLot = {
  instrument: string;
  account: string;
  side: 'Long' | 'Short';
  remainingQuantity: number;
  originalQuantity: number;
  price: number;
  time: Date;
  commissionPerUnit: number;
  sourceFile: string;
  realizedGrossPnl: number;
  realizedCommission: number;
  weightedExitPriceTotal: number;
  lastExitTime: Date | null;
};

export const matchTrades = (rows: CsvRow[], sourceFile: string): Trade[] => {
  const openLots: OpenLot[] = [];
  const trades: Trade[] = [];

  const sorted = [...rows].sort((a, b) => a.time.getTime() - b.time.getTime());

  for (const row of sorted) {
    const side: 'Long' | 'Short' = row.action === 'Buy' ? 'Long' : 'Short';
    const oppositeSide: 'Long' | 'Short' = side === 'Long' ? 'Short' : 'Long';
    const commissionPerUnit = row.quantity > 0 ? row.commission / row.quantity : 0;

    if (row.entryExit === 'Entry') {
      openLots.push({
        instrument: row.instrument,
        account: row.account,
        side,
        remainingQuantity: row.quantity,
        originalQuantity: row.quantity,
        price: row.price,
        time: row.time,
        commissionPerUnit,
        sourceFile,
        realizedGrossPnl: 0,
        realizedCommission: 0,
        weightedExitPriceTotal: 0,
        lastExitTime: null
      });
      continue;
    }

    let remaining = row.quantity;
    for (let i = 0; i < openLots.length && remaining > 0; i += 1) {
      const lot = openLots[i];
      if (
        lot.instrument !== row.instrument ||
        lot.account !== row.account ||
        lot.side !== oppositeSide
      ) {
        continue;
      }

      const matchedQty = Math.min(lot.remainingQuantity, remaining);
      const direction = lot.side === 'Long' ? 1 : -1;
      const pointValue = pointValueFor(row.instrument);
      const grossPnl = (row.price - lot.price) * direction * matchedQty * pointValue;
      const commission = (lot.commissionPerUnit + commissionPerUnit) * matchedQty;
      lot.realizedGrossPnl += grossPnl;
      lot.realizedCommission += commission;
      lot.weightedExitPriceTotal += row.price * matchedQty;
      lot.lastExitTime = row.time;
      lot.remainingQuantity -= matchedQty;
      remaining -= matchedQty;

      if (lot.remainingQuantity === 0) {
        const avgExitPrice = lot.weightedExitPriceTotal / lot.originalQuantity;
        const netPnl = lot.realizedGrossPnl - lot.realizedCommission;

        trades.push({
          account: row.account,
          instrument: row.instrument,
          side: lot.side,
          quantity: lot.originalQuantity,
          entryTime: lot.time,
          exitTime: lot.lastExitTime ?? row.time,
          entryPrice: lot.price,
          exitPrice: avgExitPrice,
          grossPnl: lot.realizedGrossPnl,
          commission: lot.realizedCommission,
          netPnl,
          tags: [],
          note: null,
          sourceFile
        });

        openLots.splice(i, 1);
        i -= 1;
      }
    }
  }

  // Some copied-account executions produce multiple truly distinct trade rows
  // with otherwise identical timestamps, prices, qty, and P&L. We stamp a
  // deterministic occurrence index so re-imports stay stable without collapsing
  // those real duplicates into one fingerprint.
  const orderedTrades = trades
    .slice()
    .sort(
      (left, right) =>
        left.exitTime.getTime() - right.exitTime.getTime() ||
        left.entryTime.getTime() - right.entryTime.getTime()
    );

  const occurrenceCounts = new Map<string, number>();
  for (const trade of orderedTrades) {
    const baseKey = [
      trade.account,
      trade.instrument,
      trade.side,
      trade.quantity,
      trade.entryTime.toISOString(),
      trade.exitTime.toISOString(),
      trade.entryPrice.toFixed(6),
      trade.exitPrice.toFixed(6),
      trade.grossPnl.toFixed(2),
      trade.commission.toFixed(2),
      trade.netPnl.toFixed(2),
      trade.sourceFile
    ].join('|');
    const nextOrdinal = (occurrenceCounts.get(baseKey) ?? 0) + 1;
    occurrenceCounts.set(baseKey, nextOrdinal);
    trade.fingerprintOrdinal = nextOrdinal;
  }

  return orderedTrades;
};

export const summarizeUnmatched = (rows: CsvRow[], trades: Trade[]) => {
  const matchedCount = trades.reduce((sum, trade) => sum + trade.quantity, 0);
  const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  return {
    matchedCount,
    totalQty
  };
};
