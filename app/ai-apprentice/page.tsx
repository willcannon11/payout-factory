'use client';

import Sidebar from '../../components/Sidebar';
import { groupCopiedTrades } from '../../lib/tradeBundles';
import { useTradingData } from '../../lib/useTradingData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const thresholds = [200, 300, 500, 750, 1000, 1500, 2000];

type ThresholdAnalysis = {
  threshold: number;
  daysReached: number;
  finishedGreen: number;
  finishedRed: number;
  avgCloseAfterTrigger: number;
  avgGiveback: number;
  retainedPct: number;
};

const analyzeThresholds = (trades: ReturnType<typeof useTradingData>['trades']): ThresholdAnalysis[] => {
  const bundles = groupCopiedTrades(trades)
    .map((bundle) => ({
      exitTime: bundle.representative.exitTime,
      netPnl: bundle.totalNetPnl
    }))
    .sort((left, right) => left.exitTime.getTime() - right.exitTime.getTime());

  const bundlesByDay = new Map<string, typeof bundles>();
  for (const bundle of bundles) {
    const key = bundle.exitTime.toISOString().slice(0, 10);
    const existing = bundlesByDay.get(key) ?? [];
    existing.push(bundle);
    bundlesByDay.set(key, existing);
  }

  return thresholds.map((threshold) => {
    let daysReached = 0;
    let finishedGreen = 0;
    let finishedRed = 0;
    let totalCloseAfterTrigger = 0;
    let totalGiveback = 0;
    let totalRetention = 0;

    for (const dayBundles of bundlesByDay.values()) {
      let running = 0;
      let reached = false;
      let triggerValue = 0;

      for (const bundle of dayBundles) {
        running += bundle.netPnl;
        if (!reached && running >= threshold) {
          reached = true;
          triggerValue = running;
        }
      }

      if (!reached) continue;

      const finalValue = running;
      daysReached += 1;
      totalCloseAfterTrigger += finalValue;
      totalGiveback += Math.max(triggerValue - finalValue, 0);
      totalRetention += triggerValue === 0 ? 0 : Math.max(Math.min(finalValue / triggerValue, 1), -1);

      if (finalValue >= threshold) {
        finishedGreen += 1;
      }

      if (finalValue < 0) {
        finishedRed += 1;
      }
    }

    return {
      threshold,
      daysReached,
      finishedGreen,
      finishedRed,
      avgCloseAfterTrigger: daysReached ? totalCloseAfterTrigger / daysReached : 0,
      avgGiveback: daysReached ? totalGiveback / daysReached : 0,
      retainedPct: daysReached ? (totalRetention / daysReached) * 100 : 0
    };
  });
};

export default function AiApprenticePage() {
  const { trades, loading, error } = useTradingData();
  const analyses = analyzeThresholds(trades).filter((item) => item.daysReached > 0);
  const recommended = analyses
    .filter((item) => item.retainedPct > 60)
    .sort((left, right) => {
      if (right.daysReached !== left.daysReached) return right.daysReached - left.daysReached;
      return right.retainedPct - left.retainedPct;
    })[0] ?? analyses[0] ?? null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">AI Apprentice</div>
            <div className="hero-subtitle">A coaching layer for your trading data: where you hit daily targets, where you gave them back, and where the data says you should probably stop.</div>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="card accent-card">
            <h3>Suggested Daily Stop Target</h3>
            <div className="value">{recommended ? formatCurrency(recommended.threshold) : 'Not enough data'}</div>
            <div className="sub">
              {recommended
                ? `${recommended.daysReached} days reached this level, with ${recommended.retainedPct.toFixed(0)}% average retention after the trigger.`
                : 'Import more trades so we can evaluate where you should probably shut it down.'}
            </div>
          </div>
          <div className="card">
            <h3>Average Giveback</h3>
            <div className="value">{recommended ? formatCurrency(recommended.avgGiveback) : '$0.00'}</div>
            <div className="sub">How much profit gets leaked after the suggested stop threshold is first touched.</div>
          </div>
          <div className="card">
            <h3>Days Still Finish Red</h3>
            <div className="value">{recommended ? `${recommended.finishedRed}/${recommended.daysReached}` : '0/0'}</div>
            <div className="sub">How often you cross the threshold and still end the day negative.</div>
          </div>
        </div>

        {error ? <div className="callout danger-callout">{error}</div> : null}

        <section className="card">
          <div className="section-header">
            <div className="section-title">Daily Target Explorer</div>
            <div className="sub">First-pass coaching logic based on running daily P&amp;L from your bundled copied trades.</div>
          </div>
          {loading ? (
            <div className="summary-panel">Crunching your trade history...</div>
          ) : analyses.length === 0 ? (
            <div className="summary-panel">No threshold suggestions yet. Import more trading history and we’ll start pattern matching.</div>
          ) : (
            <table className="table apprentice-table">
              <thead>
                <tr>
                  <th>Threshold</th>
                  <th>Days Reached</th>
                  <th>Finished Above Target</th>
                  <th>Finished Red</th>
                  <th>Avg Close After Trigger</th>
                  <th>Avg Giveback</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((item) => (
                  <tr key={item.threshold}>
                    <td>{formatCurrency(item.threshold)}</td>
                    <td>{item.daysReached}</td>
                    <td>{item.finishedGreen}</td>
                    <td>{item.finishedRed}</td>
                    <td>{formatCurrency(item.avgCloseAfterTrigger)}</td>
                    <td>{formatCurrency(item.avgGiveback)}</td>
                    <td>{item.retainedPct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-title">Good Next Builds</div>
          <div className="checklist">
            <div className="checklist-item">Setup-aware coaching, so FibRectangle and other tags each get their own stop-target suggestions.</div>
            <div className="checklist-item">A “you should have stopped here” daily recap for the sessions where you crossed a threshold and churned it back.</div>
            <div className="checklist-item">Account-stack guidance so one copied trade idea can trigger a shut-it-down prompt across the full 15-account group.</div>
          </div>
        </section>
      </main>
    </div>
  );
}
