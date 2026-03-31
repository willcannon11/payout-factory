'use client';

import { useMemo, useState } from 'react';
import BarChart from '../components/BarChart';
import LineChart from '../components/LineChart';
import Sidebar from '../components/Sidebar';
import {
  averageHoldMinutes,
  averageLosingTrade,
  averageWinningTrade,
  buildCalendarMonth,
  calculateDailyPnl,
  compareSides,
  cumulativeSeries,
  expectancy,
  formatMonthLabel,
  largestLoss,
  largestWin,
  profitFactor,
  totalPnl,
  winRate
} from '../lib/metrics';
import { useTradingData } from '../lib/useTradingData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const formatDays = (value: number) => `${value.toFixed(1)} days`;

const formatMinutes = (value: number) => `${value.toFixed(1)} min`;
const normalizeAccountKey = (value: string) => value.replace(/\D/g, '').slice(-2);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const parseDateInputValue = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const payoutRequestTradingDaySeed: Record<string, number> = {
  '05': 19
};

type RangePreset = '30d' | '60d' | 'ytd' | 'month' | 'week' | 'quarter' | 'custom';

export default function DashboardPage() {
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d');
  const { trades, payouts, loading, error } = useTradingData();
  const today = startOfDay(new Date());
  const earliestTradeDate = useMemo(() => {
    if (trades.length === 0) {
      return today;
    }
    return trades.reduce((earliest, trade) => {
      const exit = startOfDay(trade.exitTime);
      return exit < earliest ? exit : earliest;
    }, startOfDay(trades[0].exitTime));
  }, [today, trades]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const rangeConfig = useMemo(() => {
    const end = today;
    if (rangePreset === '30d') {
      return { start: addDays(end, -29), end, label: 'Last 30 Days', paceLabel: '30-day rolling calendar pace' };
    }
    if (rangePreset === '60d') {
      return { start: addDays(end, -59), end, label: 'Last 60 Days', paceLabel: '60-day rolling calendar pace' };
    }
    if (rangePreset === 'ytd') {
      return { start: new Date(end.getFullYear(), 0, 1), end, label: 'Year To Date', paceLabel: 'YTD calendar pace' };
    }
    if (rangePreset === 'month') {
      return { start: new Date(end.getFullYear(), end.getMonth(), 1), end, label: 'This Month', paceLabel: 'This month calendar pace' };
    }
    if (rangePreset === 'week') {
      return { start: addDays(end, -end.getDay()), end, label: 'This Week', paceLabel: 'This week calendar pace' };
    }
    if (rangePreset === 'quarter') {
      const quarterStartMonth = Math.floor(end.getMonth() / 3) * 3;
      return { start: new Date(end.getFullYear(), quarterStartMonth, 1), end, label: 'This Quarter', paceLabel: 'This quarter calendar pace' };
    }

    const parsedStart = parseDateInputValue(customStartDate) ?? earliestTradeDate;
    const parsedEnd = parseDateInputValue(customEndDate) ?? end;
    const safeStart = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
    const safeEnd = parsedEnd >= parsedStart ? parsedEnd : parsedStart;
    return { start: safeStart, end: safeEnd, label: 'Custom Range', paceLabel: 'Custom calendar pace' };
  }, [customEndDate, customStartDate, earliestTradeDate, rangePreset, today]);

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const exit = startOfDay(trade.exitTime);
      return exit >= rangeConfig.start && exit <= rangeConfig.end;
    });
  }, [rangeConfig.end, rangeConfig.start, trades]);
  const filteredDaily = useMemo(() => {
    const filteredMap = new Map(calculateDailyPnl(filteredTrades).map((item) => [item.date, item]));
    const series = [];
    for (let current = rangeConfig.start; current <= rangeConfig.end; current = addDays(current, 1)) {
      const key = toDateInputValue(current);
      series.push(filteredMap.get(key) ?? { date: key, netPnl: 0, trades: 0 });
    }
    return series;
  }, [filteredTrades, rangeConfig.end, rangeConfig.start]);
  const cumulative = cumulativeSeries(filteredDaily);
  const sideCompare = compareSides(filteredTrades);
  const currentMonth = buildCalendarMonth(trades, new Date());
  const rangeDays = Math.max(
    1,
    Math.floor((rangeConfig.end.getTime() - rangeConfig.start.getTime()) / 86400000) + 1
  );
  const averageDailyProfit = totalPnl(filteredTrades) / rangeDays;

  const payoutCycleAvg = (() => {
    if (payouts.length < 2) return 0;
    const sorted = [...payouts].sort((a, b) => a.requestDate.localeCompare(b.requestDate));
    let total = 0;
    let count = 0;
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = new Date(sorted[index - 1].requestDate);
      const next = new Date(sorted[index].requestDate);
      total += (next.getTime() - prev.getTime()) / 86400000;
      count += 1;
    }
    return count ? total / count : 0;
  })();

  const payoutProcessingAvg = (() => {
    const received = payouts.filter((payout) => payout.receivedDate);
    if (received.length === 0) return 0;
    const total = received.reduce((sum, payout) => {
      const start = new Date(payout.requestDate);
      const end = new Date(payout.receivedDate as string);
      return sum + (end.getTime() - start.getTime()) / 86400000;
    }, 0);
    return total / received.length;
  })();

  const totalPaidOut = payouts
    .filter((payout) => payout.status === 'paid' || payout.receivedDate || payout.approvedDate)
    .reduce((sum, payout) => sum + payout.amount, 0);

  const avgTradingDaysToPayoutRequest = (() => {
    const requestDayCounts = payouts.map((payout) => {
      const accountKey = normalizeAccountKey(payout.account);
      const requestDate = payout.requestDate;
      const seededValue = payoutRequestTradingDaySeed[accountKey] ?? 0;

      const distinctTradeDates = new Set(
        trades
          .filter((trade) => normalizeAccountKey(trade.account) === accountKey && trade.exitTime.toISOString().slice(0, 10) <= requestDate)
          .map((trade) => trade.exitTime.toISOString().slice(0, 10))
      );

      return Math.max(distinctTradeDates.size, seededValue);
    });

    if (requestDayCounts.length === 0) {
      return 0;
    }

    return requestDayCounts.reduce((sum, value) => sum + value, 0) / requestDayCounts.length;
  })();

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Dashboard</div>
            <div className="hero-subtitle">Your payout factory at a glance: equity curve, daily pace, and payout velocity.</div>
          </div>
          <div className="dashboard-filter-bar">
            <select className="select dashboard-range-select" value={rangePreset} onChange={(event) => setRangePreset(event.target.value as RangePreset)}>
              <option value="30d">30 Days</option>
              <option value="60d">60 Days</option>
              <option value="ytd">YTD</option>
              <option value="month">This Month</option>
              <option value="week">This Week</option>
              <option value="quarter">This Quarter</option>
              <option value="custom">Start / Finish Date</option>
            </select>
            {rangePreset === 'custom' ? (
              <div className="dashboard-date-row">
                <input className="input" type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} />
                <input className="input" type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} />
              </div>
            ) : null}
          </div>
        </div>

        {error ? <div className="callout danger-callout">{error}</div> : null}
        <div className="sub" style={{ marginBottom: '16px' }}>
          Showing {rangeConfig.label}: {formatMonthLabel(rangeConfig.start)} {rangeConfig.start.getDate()} through {formatMonthLabel(rangeConfig.end)} {rangeConfig.end.getDate()}.
        </div>

        <div className="kpi-grid">
          <div className="card accent-card">
            <h3>Average Daily Profit</h3>
            <div className="value">{formatCurrency(averageDailyProfit)}</div>
            <div className="sub">{rangeConfig.paceLabel}</div>
          </div>
          <div className="card">
            <h3>Total Net P&amp;L</h3>
            <div className="value">{formatCurrency(totalPnl(filteredTrades))}</div>
            <div className="sub">{filteredTrades.length} trades in range</div>
          </div>
          <div className="card">
            <h3>Win Rate</h3>
            <div className="value">{winRate(filteredTrades).toFixed(1)}%</div>
            <div className="sub">Net-positive trades</div>
          </div>
          <div className="card">
            <h3>Total Paid Out</h3>
            <div className="value">{formatCurrency(totalPaidOut)}</div>
            <div className="sub">Across all accounts</div>
          </div>
          <div className="card">
            <h3>Avg Trading Days To Request</h3>
            <div className="value">{avgTradingDaysToPayoutRequest.toFixed(1)}</div>
            <div className="sub">Trading days until payout request</div>
          </div>
          <div className="card">
            <h3>Payout Processing</h3>
            <div className="value">{formatDays(payoutProcessingAvg)}</div>
            <div className="sub">Request date to paid date</div>
          </div>
        </div>

        <div className="dashboard-grid">
          <section className="card feature-card">
            <div className="section-header">
              <div className="section-title">Cumulative P&amp;L</div>
              <div className="sub">{rangeConfig.label} equity curve</div>
            </div>
            <LineChart
              data={cumulative.map((item) => ({ label: item.date.slice(5), value: item.value }))}
              height={280}
            />
          </section>

          <section className="card stat-stack">
            <div>
              <div className="section-title">Trade Quality</div>
              <div className="metric-row">
                <span>Profit factor</span>
                <strong>{Number.isFinite(profitFactor(filteredTrades)) ? profitFactor(filteredTrades).toFixed(2) : '∞'}</strong>
              </div>
              <div className="metric-row">
                <span>Expectancy</span>
                <strong>{formatCurrency(expectancy(filteredTrades))}</strong>
              </div>
              <div className="metric-row">
                <span>Avg winner</span>
                <strong>{formatCurrency(averageWinningTrade(filteredTrades))}</strong>
              </div>
              <div className="metric-row">
                <span>Avg loser</span>
                <strong>{formatCurrency(averageLosingTrade(filteredTrades))}</strong>
              </div>
              <div className="metric-row">
                <span>Largest win / loss</span>
                <strong>{formatCurrency(largestWin(filteredTrades))} / {formatCurrency(largestLoss(filteredTrades))}</strong>
              </div>
              <div className="metric-row">
                <span>Avg hold time</span>
                <strong>{formatMinutes(averageHoldMinutes(filteredTrades))}</strong>
              </div>
            </div>
            <div className="mini-callout">
              Cycle time between payout requests is averaging <strong>{formatDays(payoutCycleAvg)}</strong>.
            </div>
          </section>
        </div>

        <div className="dashboard-grid lower-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Daily P&amp;L</div>
              <div className="sub">Green days vs red days</div>
            </div>
            <BarChart data={filteredDaily.map((item) => ({ label: item.date.slice(5), value: item.netPnl }))} />
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Long vs Short</div>
              <div className="sub">Quick side-by-side comparison</div>
            </div>
            <div className="compare-grid">
              {sideCompare.map((side) => (
                <div key={side.label} className="compare-card">
                  <div className="compare-label">{side.label}</div>
                  <div className={`compare-value ${side.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                    {formatCurrency(side.pnl)}
                  </div>
                  <div className="sub">{side.trades} trades</div>
                  <div className="sub">Win rate {side.winRate.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Monthly Calendar</div>
            <div className="sub">{formatMonthLabel(new Date())}</div>
          </div>
          <div className="calendar-board">
            <div className="calendar-board-header">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Total</span>
            </div>
            {currentMonth.map((week) => (
              <div key={week.label} className="calendar-week-row">
                {week.days.map((day) => (
                  <div key={day.date} className={`calendar-cell ${day.inMonth ? '' : 'muted-cell'}`}>
                    <div className="calendar-day-number">{day.dayNumber}</div>
                    <div className={`calendar-pnl ${day.netPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                      {formatCurrency(day.netPnl)}
                    </div>
                    <div className="sub">{day.trades} trades</div>
                  </div>
                ))}
                <div className="calendar-total-cell">
                  <strong>{week.label}</strong>
                  <div className={`calendar-pnl ${week.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                    {formatCurrency(week.totalPnl)}
                  </div>
                  <div className="sub">{week.totalTrades} trades</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {loading ? <div className="sub" style={{ marginTop: '16px' }}>Refreshing trades and payouts...</div> : null}
      </main>
    </div>
  );
}
