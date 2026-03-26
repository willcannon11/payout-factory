import { Trade } from './types';

export const buildTradeFingerprint = (trade: Trade) =>
  [
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
    trade.sourceFile,
    trade.fingerprintOrdinal ?? 1
  ].join('|');
