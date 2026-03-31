import { Trade } from './types';

export type TradeBundle = {
  key: string;
  trades: Trade[];
  representative: Trade;
  totalNetPnl: number;
  totalGrossPnl: number;
  accounts: string[];
  totalContracts: number;
};

const instrumentRoot = (instrument: string) => instrument.split(' ')[0]?.toUpperCase() || instrument.toUpperCase();

const TIME_TOLERANCE_MS = 60_000;
const PRICE_TOLERANCE = 0.25;

export const isSameCopiedTrade = (left: Trade, right: Trade) =>
  instrumentRoot(left.instrument) === instrumentRoot(right.instrument) &&
  left.side === right.side &&
  Math.abs(left.entryTime.getTime() - right.entryTime.getTime()) <= TIME_TOLERANCE_MS &&
  Math.abs(left.exitTime.getTime() - right.exitTime.getTime()) <= TIME_TOLERANCE_MS &&
  Math.abs(left.entryPrice - right.entryPrice) <= PRICE_TOLERANCE &&
  Math.abs(left.exitPrice - right.exitPrice) <= PRICE_TOLERANCE;

export const groupCopiedTrades = (trades: Trade[]) => {
  const bundles: TradeBundle[] = [];
  const sortedTrades = trades
    .slice()
    .sort(
      (left, right) =>
        left.exitTime.getTime() - right.exitTime.getTime() ||
        left.entryTime.getTime() - right.entryTime.getTime()
    );

  for (const trade of sortedTrades) {
    const existing = bundles.find((bundle) => bundle.trades.some((candidate) => isSameCopiedTrade(candidate, trade)));
    if (existing) {
      existing.trades.push(trade);
      existing.totalNetPnl += trade.netPnl;
      existing.totalGrossPnl += trade.grossPnl;
      existing.accounts.push(trade.account);
      existing.totalContracts += trade.quantity;
      continue;
    }

    bundles.push({
      key: `${instrumentRoot(trade.instrument)}|${trade.side}|${trade.entryTime.getTime()}|${trade.exitTime.getTime()}|${bundles.length}`,
      trades: [trade],
      representative: trade,
      totalNetPnl: trade.netPnl,
      totalGrossPnl: trade.grossPnl,
      accounts: [trade.account],
      totalContracts: trade.quantity
    });
  }

  return bundles;
};
