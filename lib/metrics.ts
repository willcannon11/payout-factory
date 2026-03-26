import { CalendarCell, CalendarWeek, DailyPnl, Trade } from './types';

export const toDateKey = (date: Date) => date.toISOString().split('T')[0];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);

export const calculateDailyPnl = (trades: Trade[]): DailyPnl[] => {
  const map = new Map<string, DailyPnl>();
  for (const trade of trades) {
    const key = toDateKey(trade.exitTime);
    const existing = map.get(key) ?? { date: key, netPnl: 0, trades: 0 };
    existing.netPnl += trade.netPnl;
    existing.trades += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
};

export const filterTradesByDays = (trades: Trade[], days: number, now = new Date()) => {
  const end = startOfDay(now);
  const start = addDays(end, -(days - 1));
  return trades.filter((trade) => {
    const exit = startOfDay(trade.exitTime);
    return exit >= start && exit <= end;
  });
};

export const filterTrades = (
  trades: Trade[],
  filters: {
    symbol?: string;
    tag?: string;
    side?: 'All' | 'Long' | 'Short';
    startDate?: string;
    endDate?: string;
  }
) =>
  trades.filter((trade) => {
    if (filters.symbol && trade.instrument !== filters.symbol) {
      return false;
    }
    if (filters.tag && !trade.tags.includes(filters.tag)) {
      return false;
    }
    if (filters.side && filters.side !== 'All' && trade.side !== filters.side) {
      return false;
    }
    if (filters.startDate && toDateKey(trade.exitTime) < filters.startDate) {
      return false;
    }
    if (filters.endDate && toDateKey(trade.exitTime) > filters.endDate) {
      return false;
    }
    return true;
  });

export const rollingAverageDaily = (daily: DailyPnl[], days: number, now = new Date()) => {
  const end = startOfDay(now);
  const start = addDays(end, -(days - 1));
  let total = 0;
  for (const item of daily) {
    const date = startOfDay(new Date(item.date));
    if (date >= start && date <= end) {
      total += item.netPnl;
    }
  }
  return total / days;
};

export const winRate = (trades: Trade[]) => {
  if (trades.length === 0) return 0;
  const wins = trades.filter((trade) => trade.netPnl > 0).length;
  return (wins / trades.length) * 100;
};

export const averageTrade = (trades: Trade[]) => {
  if (trades.length === 0) return 0;
  return trades.reduce((sum, trade) => sum + trade.netPnl, 0) / trades.length;
};

export const averageWinningTrade = (trades: Trade[]) => {
  const wins = trades.filter((trade) => trade.netPnl > 0);
  if (wins.length === 0) return 0;
  return wins.reduce((sum, trade) => sum + trade.netPnl, 0) / wins.length;
};

export const averageLosingTrade = (trades: Trade[]) => {
  const losses = trades.filter((trade) => trade.netPnl < 0);
  if (losses.length === 0) return 0;
  return losses.reduce((sum, trade) => sum + trade.netPnl, 0) / losses.length;
};

export const profitFactor = (trades: Trade[]) => {
  const grossWin = trades.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0)
  );
  if (grossLoss === 0) return grossWin > 0 ? Infinity : 0;
  return grossWin / grossLoss;
};

export const expectancy = (trades: Trade[]) => {
  if (trades.length === 0) return 0;
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const winRateValue = wins.length / trades.length;
  const lossRateValue = losses.length / trades.length;
  const avgWin = averageWinningTrade(trades);
  const avgLoss = Math.abs(averageLosingTrade(trades));
  return winRateValue * avgWin - lossRateValue * avgLoss;
};

export const totalPnl = (trades: Trade[]) => trades.reduce((sum, trade) => sum + trade.netPnl, 0);

export const largestWin = (trades: Trade[]) =>
  trades.reduce((max, trade) => (trade.netPnl > max ? trade.netPnl : max), 0);

export const largestLoss = (trades: Trade[]) =>
  trades.reduce((min, trade) => (trade.netPnl < min ? trade.netPnl : min), 0);

export const averageHoldMinutes = (trades: Trade[]) => {
  if (trades.length === 0) return 0;
  const totalMinutes = trades.reduce((sum, trade) => {
    return sum + (trade.exitTime.getTime() - trade.entryTime.getTime()) / 60000;
  }, 0);
  return totalMinutes / trades.length;
};

export const buildDateSeries = (daily: DailyPnl[], days: number, now = new Date()) => {
  const end = startOfDay(now);
  const start = addDays(end, -(days - 1));
  const dailyMap = new Map(daily.map((item) => [item.date, item]));
  const series: DailyPnl[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    const key = toDateKey(current);
    const value = dailyMap.get(key);
    series.push(value ?? { date: key, netPnl: 0, trades: 0 });
  }
  return series;
};

export const cumulativeSeries = (daily: DailyPnl[]) => {
  let running = 0;
  return daily.map((item) => {
    running += item.netPnl;
    return {
      date: item.date,
      value: running
    };
  });
};

export const uniqueSymbols = (trades: Trade[]) =>
  Array.from(new Set(trades.map((trade) => trade.instrument))).sort((a, b) => a.localeCompare(b));

export const uniqueTags = (trades: Trade[]) =>
  Array.from(new Set(trades.flatMap((trade) => trade.tags))).sort((a, b) => a.localeCompare(b));

export const compareSides = (trades: Trade[]) => {
  const longs = trades.filter((trade) => trade.side === 'Long');
  const shorts = trades.filter((trade) => trade.side === 'Short');
  return [
    {
      label: 'Long',
      trades: longs.length,
      pnl: totalPnl(longs),
      winRate: winRate(longs)
    },
    {
      label: 'Short',
      trades: shorts.length,
      pnl: totalPnl(shorts),
      winRate: winRate(shorts)
    }
  ];
};

export const tagBreakdown = (trades: Trade[]) =>
  uniqueTags(trades).map((tag) => {
    const taggedTrades = trades.filter((trade) => trade.tags.includes(tag));
    return {
      tag,
      trades: taggedTrades.length,
      pnl: totalPnl(taggedTrades),
      winRate: winRate(taggedTrades),
      expectancy: expectancy(taggedTrades)
    };
  });

export const buildCalendarMonth = (trades: Trade[], referenceDate: Date): CalendarWeek[] => {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const dailyMap = new Map(calculateDailyPnl(trades).map((item) => [item.date, item]));

  const cells: CalendarCell[] = [];
  for (let current = gridStart; current <= gridEnd; current = addDays(current, 1)) {
    const key = toDateKey(current);
    const daily = dailyMap.get(key);
    cells.push({
      date: key,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === referenceDate.getMonth(),
      netPnl: daily?.netPnl ?? 0,
      trades: daily?.trades ?? 0
    });
  }

  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const days = cells.slice(index, index + 7);
    weeks.push({
      label: `Week ${weeks.length + 1}`,
      totalPnl: days.reduce((sum, day) => sum + day.netPnl, 0),
      totalTrades: days.reduce((sum, day) => sum + day.trades, 0),
      days
    });
  }

  return weeks;
};
