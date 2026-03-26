'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { mapPayoutRow, mapTradeRow } from './transform';
import { PayoutRow, Trade, TradeRow } from './types';

const PAGE_SIZE = 1000;

const fetchAllRows = async <T,>(table: 'trades' | 'payouts', orderColumn: string, ascending: boolean) => {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
};

export const useTradingData = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [payouts, setPayouts] = useState<ReturnType<typeof mapPayoutRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const [tradeResponse, payoutResponse] = await Promise.all([
      fetchAllRows<TradeRow>('trades', 'exit_time', true),
      fetchAllRows<PayoutRow>('payouts', 'request_date', false)
    ]);

    if (tradeResponse.error) {
      setError(tradeResponse.error.message);
    } else {
      setTrades(((tradeResponse.data ?? []) as TradeRow[]).map(mapTradeRow));
    }

    if (payoutResponse.error) {
      setError(payoutResponse.error.message);
    } else {
      setPayouts(((payoutResponse.data ?? []) as PayoutRow[]).map(mapPayoutRow));
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return {
    trades,
    payouts,
    loading,
    error,
    reload: load
  };
};
