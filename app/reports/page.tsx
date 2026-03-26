'use client';

import { useState } from 'react';
import BarChart from '../../components/BarChart';
import LineChart from '../../components/LineChart';
import Sidebar from '../../components/Sidebar';
import {
  averageLosingTrade,
  averageWinningTrade,
  buildDateSeries,
  calculateDailyPnl,
  compareSides,
  cumulativeSeries,
  expectancy,
  filterTrades,
  filterTradesByDays,
  largestLoss,
  largestWin,
  profitFactor,
  tagBreakdown,
  totalPnl,
  uniqueSymbols,
  uniqueTags,
  winRate
} from '../../lib/metrics';
import { useTradingData } from '../../lib/useTradingData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

export default function ReportsPage() {
  const { trades, loading, error } = useTradingData();
  const [range, setRange] = useState<30 | 60 | 90>(30);
  const [symbol, setSymbol] = useState('');
  const [tag, setTag] = useState('');
  const [side, setSide] = useState<'All' | 'Long' | 'Short'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const rangedTrades = filterTradesByDays(trades, range);
  const filteredTrades = filterTrades(rangedTrades, { symbol, tag, side, startDate, endDate });
  const daily = buildDateSeries(calculateDailyPnl(filteredTrades), range);
  const cumulative = cumulativeSeries(daily);
  const sides = compareSides(filteredTrades);
  const tags = tagBreakdown(filteredTrades);
  const symbols = uniqueSymbols(trades);
  const allTags = uniqueTags(trades);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Reports</div>
            <div className="hero-subtitle">Filter by symbol, side, tag, and date range to see what is actually paying you.</div>
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

        <section className="card filter-card">
          <div className="form-row">
            <select className="select" value={symbol} onChange={(event) => setSymbol(event.target.value)}>
              <option value="">All symbols</option>
              {symbols.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="select" value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">All tags</option>
              {allTags.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="select" value={side} onChange={(event) => setSide(event.target.value as 'All' | 'Long' | 'Short')}>
              <option value="All">All sides</option>
              <option value="Long">Long</option>
              <option value="Short">Short</option>
            </select>
            <input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="sub">Filtered trades: {filteredTrades.length}</div>
        </section>

        {error ? <div className="callout danger-callout">{error}</div> : null}

        <div className="dashboard-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Daily P&amp;L</div>
              <div className="sub">Gross pace over the selected range</div>
            </div>
            <BarChart data={daily.map((item) => ({ label: item.date.slice(5), value: item.netPnl }))} />
          </section>
          <section className="card">
            <div className="section-header">
              <div className="section-title">Equity Curve</div>
              <div className="sub">Cumulative net P&amp;L</div>
            </div>
            <LineChart data={cumulative.map((item) => ({ label: item.date.slice(5), value: item.value }))} />
          </section>
        </div>

        <div className="kpi-grid" style={{ marginTop: '24px' }}>
          <div className="card">
            <h3>Total Net P&amp;L</h3>
            <div className="value">{formatCurrency(totalPnl(filteredTrades))}</div>
          </div>
          <div className="card">
            <h3>Win Rate</h3>
            <div className="value">{winRate(filteredTrades).toFixed(1)}%</div>
          </div>
          <div className="card">
            <h3>Profit Factor</h3>
            <div className="value">{Number.isFinite(profitFactor(filteredTrades)) ? profitFactor(filteredTrades).toFixed(2) : '∞'}</div>
          </div>
          <div className="card">
            <h3>Expectancy</h3>
            <div className="value">{formatCurrency(expectancy(filteredTrades))}</div>
          </div>
        </div>

        <div className="dashboard-grid lower-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Long vs Short</div>
              <div className="sub">Compare by side</div>
            </div>
            <div className="compare-grid">
              {sides.map((entry) => (
                <div key={entry.label} className="compare-card">
                  <div className="compare-label">{entry.label}</div>
                  <div className={`compare-value ${entry.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                    {formatCurrency(entry.pnl)}
                  </div>
                  <div className="sub">{entry.trades} trades</div>
                  <div className="sub">Win rate {entry.winRate.toFixed(1)}%</div>
                </div>
              ))}
            </div>
            <div className="metric-grid">
              <div className="metric-row"><span>Avg winner</span><strong>{formatCurrency(averageWinningTrade(filteredTrades))}</strong></div>
              <div className="metric-row"><span>Avg loser</span><strong>{formatCurrency(averageLosingTrade(filteredTrades))}</strong></div>
              <div className="metric-row"><span>Largest win</span><strong>{formatCurrency(largestWin(filteredTrades))}</strong></div>
              <div className="metric-row"><span>Largest loss</span><strong>{formatCurrency(largestLoss(filteredTrades))}</strong></div>
            </div>
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Tag Breakdown</div>
              <div className="sub">Strategy tags and how they perform</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Trades</th>
                  <th>Win Rate</th>
                  <th>P&amp;L</th>
                  <th>Expectancy</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((entry) => (
                  <tr key={entry.tag}>
                    <td>{entry.tag}</td>
                    <td>{entry.trades}</td>
                    <td>{entry.winRate.toFixed(1)}%</td>
                    <td className={entry.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{formatCurrency(entry.pnl)}</td>
                    <td>{formatCurrency(entry.expectancy)}</td>
                  </tr>
                ))}
                {tags.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="sub">No tags yet. Use the Trades page to tag setups like `FibRectangle` or `Impulse H1KL Re-test`.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        {loading ? <div className="sub" style={{ marginTop: '16px' }}>Refreshing report data...</div> : null}
      </main>
    </div>
  );
}
