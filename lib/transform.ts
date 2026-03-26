import { Trade, TradeRow, PayoutRow } from './types';

export const mapTradeRow = (row: TradeRow): Trade => ({
  id: row.id,
  account: row.account,
  instrument: row.instrument,
  side: row.side,
  quantity: row.quantity,
  entryTime: new Date(row.entry_time),
  exitTime: new Date(row.exit_time),
  entryPrice: row.entry_price,
  exitPrice: row.exit_price,
  grossPnl: row.gross_pnl,
  commission: row.commission,
  netPnl: row.net_pnl,
  tags: row.trade_tags ?? [],
  note: row.trade_note,
  sourceFile: row.source_file
});

export const mapPayoutRow = (row: PayoutRow) => ({
  id: row.id,
  account: row.account,
  requestDate: row.request_date,
  approvedDate: row.approved_date,
  receivedDate: row.received_date,
  amount: row.amount,
  status: row.status
});
