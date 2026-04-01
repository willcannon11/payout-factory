'use client';

import Sidebar from '../../components/Sidebar';
import { tickValueFor } from '../../lib/instruments';
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

type CloseEarlyAnalysis = {
  reviewedTrades: number;
  wouldHaveWonCount: number;
  wouldHaveLostCount: number;
  missedProfit: number;
  missedLoss: number;
  netConsequence: number;
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

const analyzeCloseEarly = (trades: ReturnType<typeof useTradingData>['trades']): CloseEarlyAnalysis => {
  const bundles = groupCopiedTrades(trades);

  return bundles.reduce<CloseEarlyAnalysis>(
    (summary, bundle) => {
      const outcome = bundle.representative.closeEarlyOutcome;
      const ticks = bundle.representative.closeEarlyTicks;

      if (!outcome || ticks === null || ticks === undefined || ticks <= 0) {
        return summary;
      }

      const totalImpact = ticks * tickValueFor(bundle.representative.instrument) * bundle.totalContracts;
      summary.reviewedTrades += 1;

      if (outcome === 'winner') {
        summary.wouldHaveWonCount += 1;
        summary.missedProfit += totalImpact;
      } else {
        summary.wouldHaveLostCount += 1;
        summary.missedLoss += totalImpact;
      }

      summary.netConsequence = summary.missedProfit - summary.missedLoss;
      return summary;
    },
    {
      reviewedTrades: 0,
      wouldHaveWonCount: 0,
      wouldHaveLostCount: 0,
      missedProfit: 0,
      missedLoss: 0,
      netConsequence: 0
    }
  );
};

export default function AiApprenticePage() {
  const { trades, loading, error } = useTradingData();
  const analyses = analyzeThresholds(trades).filter((item) => item.daysReached > 0);
  const closeEarly = analyzeCloseEarly(trades);
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
          <div className="card">
            <h3>Missed Profit From Closing Early</h3>
            <div className="value">{formatCurrency(closeEarly.missedProfit)}</div>
            <div className="sub">
              {closeEarly.wouldHaveWonCount > 0
                ? `${closeEarly.wouldHaveWonCount} close-early trade${closeEarly.wouldHaveWonCount === 1 ? '' : 's'} would&apos;ve finished green if you had let them play out.`
                : 'No close-early winner reviews logged yet.'}
            </div>
          </div>
          <div className="card">
            <h3>Missed Loss From Closing Early</h3>
            <div className="value">{formatCurrency(closeEarly.missedLoss)}</div>
            <div className="sub">
              {closeEarly.wouldHaveLostCount > 0
                ? `${closeEarly.wouldHaveLostCount} close-early trade${closeEarly.wouldHaveLostCount === 1 ? '' : 's'} avoided losses after your early exit.`
                : 'No close-early loser reviews logged yet.'}
            </div>
          </div>
          <div className="card">
            <h3>Net Consequence Of Closing Early</h3>
            <div className={`value ${closeEarly.netConsequence >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
              {formatCurrency(closeEarly.netConsequence)}
            </div>
            <div className="sub">
              {closeEarly.reviewedTrades > 0
                ? `${closeEarly.reviewedTrades} reviewed close-early trade${closeEarly.reviewedTrades === 1 ? '' : 's'} across your bundled journal.`
                : 'Start logging close-early outcomes in the trade journal to see the tradeoff here.'}
            </div>
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
          <div className="section-header">
            <div className="section-title">Closing Early Review</div>
            <div className="sub">Manual coaching layer based on the winner/loser outcome and ticks you log during journaling.</div>
          </div>
          <div className="summary-panel" style={{ marginTop: '12px' }}>
            {closeEarly.reviewedTrades > 0
              ? closeEarly.netConsequence >= 0
                ? `Your logged close-early reviews suggest holding to plan would have added ${formatCurrency(closeEarly.netConsequence)} net so far. The current sample is ${closeEarly.wouldHaveWonCount} would-have-won trades versus ${closeEarly.wouldHaveLostCount} would-have-lost trades.`
                : `Your logged close-early reviews suggest your early exits have avoided ${formatCurrency(Math.abs(closeEarly.netConsequence))} net so far. The current sample is ${closeEarly.wouldHaveWonCount} would-have-won trades versus ${closeEarly.wouldHaveLostCount} would-have-lost trades.`
              : 'When you mark a trade as closed early and log the remaining ticks, this section will tell you whether your habit is costing you more profit than it is saving in losses.'}
          </div>
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-title">Good Next Builds</div>
          <div className="checklist">
            <div className="checklist-item">Setup-aware coaching, so FibRectangle and other tags each get their own stop-target suggestions.</div>
            <div className="checklist-item">A “you should have stopped here” daily recap for the sessions where you crossed a threshold and churned it back.</div>
            <div className="checklist-item">Setup-level close-early analysis, so each trade pattern shows how often you cut winners versus sidestep losers.</div>
          </div>
        </section>
      </main>
    </div>
  );
}
