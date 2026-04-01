'use client';

import { FormEvent, useMemo, useState } from 'react';
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
  finishedAboveTarget: number;
  finishedBelowTarget: number;
  finishedRed: number;
  avgEndOfDayPnl: number;
  avgPullbackFromTrigger: number;
  keptPctOfTrigger: number;
  dayOutcomes: Array<{
    day: string;
    triggerValue: number;
    finalValue: number;
    outcome: 'above_target' | 'below_target' | 'red';
  }>;
};

type CloseEarlyAnalysis = {
  reviewedTrades: number;
  wouldHaveWonCount: number;
  wouldHaveLostCount: number;
  missedProfit: number;
  missedLoss: number;
  netConsequence: number;
};

const tradeDayKey = (date: Date, timeZone = 'America/New_York') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const analyzeThresholds = (trades: ReturnType<typeof useTradingData>['trades']): ThresholdAnalysis[] => {
  const tradesByDay = new Map<string, typeof trades>();
  for (const trade of trades) {
    const key = tradeDayKey(trade.exitTime);
    const existing = tradesByDay.get(key) ?? [];
    existing.push(trade);
    tradesByDay.set(key, existing);
  }

  return thresholds.map((threshold) => {
    let daysReached = 0;
    let finishedAboveTarget = 0;
    let finishedBelowTarget = 0;
    let finishedRed = 0;
    let totalEndOfDayPnl = 0;
    let totalPullbackFromTrigger = 0;
    let totalRetention = 0;
    const dayOutcomes: ThresholdAnalysis['dayOutcomes'] = [];

    for (const [day, dayTrades] of tradesByDay.entries()) {
      const accounts = Array.from(new Set(dayTrades.map((trade) => trade.account))).sort((left, right) => left.localeCompare(right));
      if (accounts.length === 0) {
        continue;
      }

      const runningByAccount = new Map(accounts.map((account) => [account, 0]));
      const eventDeltas = new Map<number, Map<string, number>>();
      for (const trade of dayTrades) {
        const time = trade.exitTime.getTime();
        const existingAtTime = eventDeltas.get(time) ?? new Map<string, number>();
        existingAtTime.set(trade.account, (existingAtTime.get(trade.account) ?? 0) + trade.netPnl);
        eventDeltas.set(time, existingAtTime);
      }

      const orderedTimes = Array.from(eventDeltas.keys()).sort((left, right) => left - right);
      let reached = false;
      let triggerValue = 0;
      let averageRunning = 0;

      for (const time of orderedTimes) {
        const deltas = eventDeltas.get(time);
        if (!deltas) {
          continue;
        }

        for (const [account, delta] of deltas.entries()) {
          runningByAccount.set(account, (runningByAccount.get(account) ?? 0) + delta);
        }

        averageRunning =
          Array.from(runningByAccount.values()).reduce((sum, value) => sum + value, 0) / accounts.length;

        if (!reached && averageRunning >= threshold) {
          reached = true;
          triggerValue = averageRunning;
        }
      }

      if (!reached) continue;

      const finalValue =
        Array.from(runningByAccount.values()).reduce((sum, value) => sum + value, 0) / accounts.length;
      daysReached += 1;
      totalEndOfDayPnl += finalValue;
      totalPullbackFromTrigger += Math.max(triggerValue - finalValue, 0);
      totalRetention += triggerValue === 0 ? 0 : Math.max(Math.min(finalValue / triggerValue, 1), -1);

      if (finalValue >= threshold) {
        finishedAboveTarget += 1;
        dayOutcomes.push({ day, triggerValue, finalValue, outcome: 'above_target' });
      } else if (finalValue >= 0) {
        finishedBelowTarget += 1;
        dayOutcomes.push({ day, triggerValue, finalValue, outcome: 'below_target' });
      } else {
        finishedRed += 1;
        dayOutcomes.push({ day, triggerValue, finalValue, outcome: 'red' });
      }
    }

    return {
      threshold,
      daysReached,
      finishedAboveTarget,
      finishedBelowTarget,
      finishedRed,
      avgEndOfDayPnl: daysReached ? totalEndOfDayPnl / daysReached : 0,
      avgPullbackFromTrigger: daysReached ? totalPullbackFromTrigger / daysReached : 0,
      keptPctOfTrigger: daysReached ? (totalRetention / daysReached) * 100 : 0,
      dayOutcomes
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

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const buildApprenticeContext = (
  analyses: ThresholdAnalysis[],
  recommended: ThresholdAnalysis | null,
  closeEarly: CloseEarlyAnalysis
) => ({
  focus: 'Per-account daily target coaching. All threshold results are computed using representative per-account P&L, not bundled all-account totals.',
  suggestedDailyTargetPerAccount: recommended
    ? {
      threshold: recommended.threshold,
      daysReached: recommended.daysReached,
      finishedAboveTarget: recommended.finishedAboveTarget,
      finishedBelowTarget: recommended.finishedBelowTarget,
      finishedRed: recommended.finishedRed,
      avgEndOfDayPnl: Number(recommended.avgEndOfDayPnl.toFixed(2)),
      avgPullbackFromTrigger: Number(recommended.avgPullbackFromTrigger.toFixed(2)),
      keptPctOfTrigger: Number(recommended.keptPctOfTrigger.toFixed(1)),
      dayOutcomes: recommended.dayOutcomes
    }
    : null,
  thresholdTable: analyses.map((item) => ({
    threshold: item.threshold,
    daysReached: item.daysReached,
    finishedAboveTarget: item.finishedAboveTarget,
    finishedBelowTarget: item.finishedBelowTarget,
    finishedRed: item.finishedRed,
    avgEndOfDayPnl: Number(item.avgEndOfDayPnl.toFixed(2)),
    avgPullbackFromTrigger: Number(item.avgPullbackFromTrigger.toFixed(2)),
    keptPctOfTrigger: Number(item.keptPctOfTrigger.toFixed(1)),
    dayOutcomes: item.dayOutcomes
  })),
  closeEarlyReview: {
    reviewedTrades: closeEarly.reviewedTrades,
    wouldHaveWonCount: closeEarly.wouldHaveWonCount,
    wouldHaveLostCount: closeEarly.wouldHaveLostCount,
    missedProfit: Number(closeEarly.missedProfit.toFixed(2)),
    missedLoss: Number(closeEarly.missedLoss.toFixed(2)),
    netConsequence: Number(closeEarly.netConsequence.toFixed(2))
  }
});

export default function AiApprenticePage() {
  const { trades, loading, error } = useTradingData();
  const analyses = analyzeThresholds(trades).filter((item) => item.daysReached > 0);
  const closeEarly = analyzeCloseEarly(trades);
  const [question, setQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const recommended = analyses
    .filter((item) => item.keptPctOfTrigger > 60)
    .sort((left, right) => {
      if (right.daysReached !== left.daysReached) return right.daysReached - left.daysReached;
      return right.keptPctOfTrigger - left.keptPctOfTrigger;
    })[0] ?? analyses[0] ?? null;
  const chatContext = useMemo(
    () => buildApprenticeContext(analyses, recommended, closeEarly),
    [analyses, closeEarly, recommended]
  );

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || chatLoading) {
      return;
    }

    const nextMessages = [...chatMessages, { role: 'user' as const, content: trimmedQuestion }];
    setChatMessages(nextMessages);
    setQuestion('');
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch('/api/ai-apprentice/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          messages: nextMessages,
          context: chatContext
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'AI Apprentice could not answer right now.');
      }

      const answer = String(result?.answer || '').trim();
      setChatMessages((current) => [...current, { role: 'assistant', content: answer || 'I could not generate an answer yet.' }]);
    } catch (submitError) {
      setChatError(submitError instanceof Error ? submitError.message : 'AI Apprentice could not answer right now.');
    } finally {
      setChatLoading(false);
    }
  };

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
            <h3>Daily Profit Target - Per Account</h3>
            <div className="value">{recommended ? formatCurrency(recommended.threshold) : 'Not enough data'}</div>
            <div className="sub">
              {recommended
                ? `${recommended.daysReached} days reached this per-account level, with ${recommended.finishedAboveTarget} finishing above target and ${recommended.finishedRed} ending red.`
                : 'Import more trades so we can evaluate the per-account level where you should probably shut it down.'}
            </div>
          </div>
          <div className="card">
            <h3>Finished Below Target</h3>
            <div className="value">{recommended ? `${recommended.finishedBelowTarget}/${recommended.daysReached}` : '0/0'}</div>
            <div className="sub">Days that hit the target per account, then gave some back but still finished green.</div>
          </div>
          <div className="card">
            <h3>Days Still Finish Red</h3>
            <div className="value">{recommended ? `${recommended.finishedRed}/${recommended.daysReached}` : '0/0'}</div>
            <div className="sub">How often one account crosses the target and still ends the day negative.</div>
          </div>
          <div className="card">
            <h3>Average Giveback - Per Account</h3>
            <div className="value">{recommended ? formatCurrency(recommended.avgPullbackFromTrigger) : '$0.00'}</div>
            <div className="sub">Average pullback per account from the first time you crossed the target to the end of the day.</div>
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
            <div className="sub">Computed from timestamped imported trades using the average running P&amp;L per account for each day, not the full 15-account total.</div>
          </div>
          {loading ? (
            <div className="summary-panel">Crunching your trade history...</div>
          ) : analyses.length === 0 ? (
            <div className="summary-panel">No threshold suggestions yet. Import more trading history and we’ll start pattern matching.</div>
          ) : (
            <>
              <div className="summary-panel" style={{ marginBottom: '16px' }}>
                `Average End Of Day P&L` is the average per-account finish on days where that target was hit.
                {' '}`Average Pullback` is how much per account you gave back from the first cross above the target to the close.
                {' '}`Kept %` is the share of that first trigger value you still had by day end.
              </div>
              <div style={{ display: 'grid', gap: '14px', marginBottom: '16px' }}>
                {analyses.map((item) => {
                  const abovePct = item.daysReached ? (item.finishedAboveTarget / item.daysReached) * 100 : 0;
                  const belowPct = item.daysReached ? (item.finishedBelowTarget / item.daysReached) * 100 : 0;
                  const redPct = item.daysReached ? (item.finishedRed / item.daysReached) * 100 : 0;

                  return (
                    <div key={`chart-${item.threshold}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <strong>{formatCurrency(item.threshold)} per account</strong>
                        <div className="sub">{item.daysReached} days reached</div>
                      </div>
                      <div style={{ display: 'flex', width: '100%', minHeight: '16px', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(140, 160, 200, 0.16)', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ width: `${abovePct}%`, background: 'rgba(42, 208, 127, 0.75)' }} />
                        <div style={{ width: `${belowPct}%`, background: 'rgba(245, 158, 11, 0.75)' }} />
                        <div style={{ width: `${redPct}%`, background: 'rgba(240, 82, 82, 0.75)' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }} className="sub">
                        <span>Above target: {item.finishedAboveTarget}</span>
                        <span>Below target but green: {item.finishedBelowTarget}</span>
                        <span>Red: {item.finishedRed}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <table className="table apprentice-table">
                <thead>
                  <tr>
                    <th>Target Per Account</th>
                    <th>Days Reached</th>
                    <th>Finished Above Target</th>
                    <th>Finished Below Target</th>
                    <th>Finished Red</th>
                    <th>Avg End Of Day P&amp;L</th>
                    <th>Avg Pullback</th>
                    <th>Kept %</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((item) => (
                    <tr key={item.threshold}>
                      <td>{formatCurrency(item.threshold)}</td>
                      <td>{item.daysReached}</td>
                      <td>{item.finishedAboveTarget}</td>
                      <td>{item.finishedBelowTarget}</td>
                      <td>{item.finishedRed}</td>
                      <td>{formatCurrency(item.avgEndOfDayPnl)}</td>
                      <td>{formatCurrency(item.avgPullbackFromTrigger)}</td>
                      <td>{item.keptPctOfTrigger.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-header">
            <div className="section-title">Chat With AI Apprentice</div>
            <div className="sub">Ask questions about your per-account target behavior, giveback, or close-early reviews.</div>
          </div>
          <div className="checklist" style={{ marginBottom: '16px' }}>
            {[
              'How often do I hit $200 per account and still finish red?',
              'What target per account looks the most stable in my data?',
              'Do my close-early reviews suggest I should let winners play out more often?'
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="btn secondary"
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => setQuestion(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="summary-panel" style={{ marginBottom: '16px' }}>
            {chatMessages.length === 0
              ? 'The AI chat uses the live stats on this page as context, so it can answer questions about your current threshold table and close-early reviews instead of speaking in generalities.'
              : null}
            {chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={{ marginTop: index === 0 ? 0 : '14px' }}>
                <div className="field-label" style={{ marginBottom: '6px' }}>{message.role === 'user' ? 'You' : 'AI Apprentice'}</div>
                <div>{message.content}</div>
              </div>
            ))}
            {chatLoading ? (
              <div style={{ marginTop: '14px' }}>
                <div className="field-label" style={{ marginBottom: '6px' }}>AI Apprentice</div>
                <div>Thinking through your stats...</div>
              </div>
            ) : null}
          </div>
          <form onSubmit={submitQuestion}>
            <textarea
              className="input note-input"
              placeholder="Ask about your daily target behavior, giveback, or close-early data"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
              <div className="sub">
                Questions are answered from the live stats on this page, with OpenAI used only to turn the numbers into coaching feedback.
              </div>
              <button type="submit" className="btn" disabled={chatLoading || !question.trim()}>
                {chatLoading ? 'Asking...' : 'Ask AI Apprentice'}
              </button>
            </div>
          </form>
          {chatError ? <div className="callout danger-callout" style={{ marginTop: '12px' }}>{chatError}</div> : null}
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
