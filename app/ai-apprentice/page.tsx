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
      netPnl: bundle.representative.netPnl
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
    let finishedAboveTarget = 0;
    let finishedBelowTarget = 0;
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
        finishedAboveTarget += 1;
      } else if (finalValue >= 0) {
        finishedBelowTarget += 1;
      } else {
        finishedRed += 1;
      }
    }

    return {
      threshold,
      daysReached,
      finishedAboveTarget,
      finishedBelowTarget,
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
        avgCloseAfterTrigger: Number(recommended.avgCloseAfterTrigger.toFixed(2)),
        avgGiveback: Number(recommended.avgGiveback.toFixed(2)),
        retainedPct: Number(recommended.retainedPct.toFixed(1))
      }
    : null,
  thresholdTable: analyses.map((item) => ({
    threshold: item.threshold,
    daysReached: item.daysReached,
    finishedAboveTarget: item.finishedAboveTarget,
    finishedBelowTarget: item.finishedBelowTarget,
    finishedRed: item.finishedRed,
    avgCloseAfterTrigger: Number(item.avgCloseAfterTrigger.toFixed(2)),
    avgGiveback: Number(item.avgGiveback.toFixed(2)),
    retainedPct: Number(item.retainedPct.toFixed(1))
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
    .filter((item) => item.retainedPct > 60)
    .sort((left, right) => {
      if (right.daysReached !== left.daysReached) return right.daysReached - left.daysReached;
      return right.retainedPct - left.retainedPct;
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
            <div className="value">{recommended ? formatCurrency(recommended.avgGiveback) : '$0.00'}</div>
            <div className="sub">How much one account gives back after the suggested target is first touched.</div>
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
            <div className="sub">First-pass coaching logic based on per-account daily P&amp;L, using one representative trade path instead of the full copied-account stack.</div>
          </div>
          {loading ? (
            <div className="summary-panel">Crunching your trade history...</div>
          ) : analyses.length === 0 ? (
            <div className="summary-panel">No threshold suggestions yet. Import more trading history and we’ll start pattern matching.</div>
          ) : (
            <table className="table apprentice-table">
              <thead>
                <tr>
                  <th>Target Per Account</th>
                  <th>Days Reached</th>
                  <th>Finished Above Target</th>
                  <th>Finished Below Target</th>
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
                    <td>{item.finishedAboveTarget}</td>
                    <td>{item.finishedBelowTarget}</td>
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
