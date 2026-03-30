'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { formatMonthLabel } from '../../lib/metrics';
import { groupCopiedTrades } from '../../lib/tradeBundles';
import { useTradingData } from '../../lib/useTradingData';
import { CalendarWeek } from '../../lib/types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const buildCalendarMonthFromDaily = (
  dailyMap: Map<string, { pnl: number; trades: number }>,
  referenceDate: Date
): CalendarWeek[] => {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());

  const cells = [];
  for (let current = gridStart; current <= gridEnd; current = addDays(current, 1)) {
    const key = toDateKey(current);
    const daily = dailyMap.get(key);
    cells.push({
      date: key,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === referenceDate.getMonth(),
      netPnl: daily?.pnl ?? 0,
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

export default function CalendarPage() {
  const router = useRouter();
  const [monthOffset, setMonthOffset] = useState(0);
  const [pnlMode, setPnlMode] = useState<'gross' | 'net'>('gross');
  const { trades, loading } = useTradingData();

  const bundledTrades = useMemo(() => groupCopiedTrades(trades), [trades]);

  const referenceDate = new Date();
  referenceDate.setMonth(referenceDate.getMonth() + monthOffset);
  const yearReference = referenceDate.getFullYear();

  const dailyMap = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number }>();
    for (const bundle of bundledTrades) {
      const key = toDateKey(bundle.representative.exitTime);
      const current = map.get(key) ?? { pnl: 0, trades: 0 };
      current.pnl += pnlMode === 'gross' ? bundle.totalGrossPnl : bundle.totalNetPnl;
      current.trades += 1;
      map.set(key, current);
    }
    return map;
  }, [bundledTrades, pnlMode]);

  const weeks = useMemo(() => buildCalendarMonthFromDaily(dailyMap, referenceDate), [dailyMap, referenceDate]);
  const monthlyPnl = weeks.reduce((sum, week) => sum + week.totalPnl, 0);
  const monthlyTrades = weeks.reduce((sum, week) => sum + week.totalTrades, 0);
  const monthlyViews = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const monthDate = new Date(yearReference, monthIndex, 1);
        const monthWeeks = buildCalendarMonthFromDaily(dailyMap, monthDate);
        const monthPnl = monthWeeks.reduce((sum, week) => sum + week.totalPnl, 0);

        return {
          monthDate,
          monthPnl,
          days: monthWeeks.flatMap((week) => week.days).filter((day) => day.inMonth)
        };
      }),
    [dailyMap, yearReference]
  );

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Calendar</div>
            <div className="hero-subtitle">Monthly and weekly P&amp;L rolled into one view, using bundled copied trades instead of per-account trade counts.</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="range-toggle">
              <button onClick={() => setMonthOffset(monthOffset - 1)}>Previous</button>
              <button onClick={() => setMonthOffset(0)} className={monthOffset === 0 ? 'active' : ''}>Current</button>
              <button onClick={() => setMonthOffset(monthOffset + 1)}>Next</button>
            </div>
            <div className="range-toggle">
              <button onClick={() => setPnlMode('gross')} className={pnlMode === 'gross' ? 'active' : ''}>Gross</button>
              <button onClick={() => setPnlMode('net')} className={pnlMode === 'net' ? 'active' : ''}>Net</button>
            </div>
          </div>
        </div>

        <section className="card">
          <div className="section-header">
            <div>
              <div className="section-title">{formatMonthLabel(referenceDate)}</div>
              <div className="sub">{monthlyTrades} trades in this month grid</div>
            </div>
            <div className={`value ${monthlyPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>{formatCurrency(monthlyPnl)}</div>
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
              <span>Week Total</span>
            </div>
            {weeks.map((week) => (
              <div key={week.label} className="calendar-week-row">
                {week.days.map((day) => (
                  day.inMonth ? (
                    <Link
                      key={day.date}
                      href={`/trades?day=${day.date}`}
                      className={`calendar-cell expanded ${day.trades === 0 ? 'muted-cell' : ''}`}
                      style={{ cursor: 'pointer', textAlign: 'left', color: 'var(--ink)', textDecoration: 'none' }}
                    >
                      <div className="calendar-day-number">{day.dayNumber}</div>
                      <div className={`calendar-pnl ${day.netPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                        {formatCurrency(day.netPnl)}
                      </div>
                      <div className="sub">{day.trades} trades</div>
                    </Link>
                  ) : (
                    <div
                      key={day.date}
                      className="calendar-cell expanded muted-cell"
                      style={{ textAlign: 'left' }}
                    >
                      <div className="calendar-day-number">{day.dayNumber}</div>
                      <div className={`calendar-pnl ${day.netPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                        {formatCurrency(day.netPnl)}
                      </div>
                      <div className="sub">{day.trades} trades</div>
                    </div>
                  )
                ))}
                <div className="calendar-total-cell expanded">
                  <strong>{week.label}</strong>
                  <div className={`calendar-pnl ${week.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                    {formatCurrency(week.totalPnl)}
                  </div>
                  <div className="sub">{week.totalTrades} trades</div>
                </div>
              </div>
            ))}
          </div>

          {loading ? <div className="sub" style={{ marginTop: '12px' }}>Refreshing calendar data...</div> : null}
        </section>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">{yearReference} Month Overview</div>
              <div className="sub">Quick view of each month with monthly P&amp;L, closer to the Tradervue layout you showed.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {monthlyViews.map((month) => (
              <button
                key={month.monthDate.toISOString()}
                type="button"
                className="card"
                style={{ textAlign: 'left', padding: '16px', cursor: 'pointer', color: 'var(--ink)' }}
                onClick={() => setMonthOffset((month.monthDate.getFullYear() - new Date().getFullYear()) * 12 + (month.monthDate.getMonth() - new Date().getMonth()))}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>{formatMonthLabel(month.monthDate)}</div>
                  <div className={month.monthPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{formatCurrency(month.monthPnl)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {month.days.map((day) => (
                    <div
                      key={day.date}
                      style={{
                        borderRadius: '10px',
                        padding: '6px 0',
                        textAlign: 'center',
                        background: day.netPnl === 0 ? 'rgba(255,255,255,0.03)' : day.netPnl > 0 ? 'rgba(42,208,127,0.12)' : 'rgba(255,107,107,0.12)',
                        color: day.netPnl === 0 ? 'var(--ink-dim)' : day.netPnl > 0 ? 'var(--pnl-positive)' : 'var(--pnl-negative)',
                        fontSize: '12px'
                      }}
                    >
                      {day.dayNumber}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
