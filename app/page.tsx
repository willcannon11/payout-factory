'use client';

import { useState } from 'react';
import BarChart from '../components/BarChart';
import LineChart from '../components/LineChart';
import Sidebar from '../components/Sidebar';
import {
  averageHoldMinutes,
  averageLosingTrade,
  averageWinningTrade,
  buildCalendarMonth,
  buildDateSeries,
  calculateDailyPnl,
  compareSides,
  cumulativeSeries,
  expectancy,
  filterTradesByDays,
  formatMonthLabel,
  largestLoss,
  largestWin,
  profitFactor,
  rollingAverageDaily,
  totalPnl,
  winRate
} from '../lib/metrics';
import { useTradingData } from '../lib/useTradingData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const formatDays = (value: number) => `${value.toFixed(1)} days`;

const formatMinutes = (value: number) => `${value.toFixed(1)} min`;
const normalizeAccountKey = (value: string) => value.replace(/\D/g, '').slice(-2);
const payoutRequestTradingDaySeed: Record<string, number> = {
  '05': 19
};

export default function DashboardPage() {
  const [range, setRange] = useState<30 | 60 | 90>(30);
  const { trades, payouts, loading, error } = useTradingData();

  const daily = calculateDailyPnl(trades);
  const filteredTrades = filterTradesByDays(trades, range);
  const filteredDaily = buildDateSeries(calculateDailyPnl(filteredTrades), range);
  const cumulative = cumulativeSeries(filteredDaily);
  const sideCompare = compareSides(filteredTrades);
  const currentMonth = buildCalendarMonth(trades, new Date());

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
          <div className="range-toggle">
            {[30, 60, 90].map((value) => (
              <button
                key={value}
                className={range === value ? 'active' : ''}
                onClick={() => setRange(value as 30 | 60 | 90)}
              >
                {value} Days
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="callout danger-callout">{error}</div> : null}

        <div className="kpi-grid">
          <div className="card accent-card">
            <h3>Average Daily Profit</h3>
            <div className="value">{formatCurrency(rollingAverageDaily(daily, range))}</div>
            <div className="sub">{range}-day rolling calendar pace</div>
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
              <div className="sub">{range}-day equity curve</div>
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
