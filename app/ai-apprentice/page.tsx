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

type AccountDayPath = {
  account: string;
  day: string;
  final: number;
  peak: number;
  path: Array<{
    time: number;
    running: number;
  }>;
};

type StopTargetBacktest = {
  threshold: number;
  reachedDays: number;
  reachedPct: number;
  avgRealized: number;
  avgActualFinal: number;
  avgDelta: number;
  avgRealizedOnReachedDays: number;
  avgActualFinalOnReachedDays: number;
  avgDeltaOnReachedDays: number;
  betterThanActualDays: number;
  worseThanActualDays: number;
  unchangedDays: number;
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

const buildAccountDayPaths = (trades: ReturnType<typeof useTradingData>['trades']): AccountDayPath[] => {
  const tradesByDay = new Map<string, typeof trades>();
  for (const trade of trades) {
    const key = tradeDayKey(trade.exitTime);
    const existing = tradesByDay.get(key) ?? [];
    existing.push(trade);
    tradesByDay.set(key, existing);
  }

  const accountDays: AccountDayPath[] = [];
  for (const [day, dayTrades] of tradesByDay.entries()) {
    const tradesByAccount = new Map<string, typeof dayTrades>();
    for (const trade of dayTrades) {
      const existing = tradesByAccount.get(trade.account) ?? [];
      existing.push(trade);
      tradesByAccount.set(trade.account, existing);
    }

    for (const [account, accountTrades] of tradesByAccount.entries()) {
      const orderedTrades = accountTrades
        .slice()
        .sort((left, right) => left.exitTime.getTime() - right.exitTime.getTime());
      let running = 0;
      let peak = Number.NEGATIVE_INFINITY;
      const path = orderedTrades.map((trade) => {
        running += trade.netPnl;
        peak = Math.max(peak, running);
        return {
          time: trade.exitTime.getTime(),
          running
        };
      });

      accountDays.push({
        account,
        day,
        final: running,
        peak: Number.isFinite(peak) ? peak : 0,
        path
      });
    }
  }

  return accountDays.sort((left, right) => left.day.localeCompare(right.day) || left.account.localeCompare(right.account));
};

const analyzeThresholds = (accountDays: AccountDayPath[]): ThresholdAnalysis[] =>
  thresholds.map((threshold) => {
    let daysReached = 0;
    let finishedAboveTarget = 0;
    let finishedBelowTarget = 0;
    let finishedRed = 0;
    let totalEndOfDayPnl = 0;
    let totalPullbackFromTrigger = 0;
    let totalRetention = 0;
    const dayOutcomes: ThresholdAnalysis['dayOutcomes'] = [];

    for (const accountDay of accountDays) {
      const hit = accountDay.path.find((point) => point.running >= threshold);
      const reached = Boolean(hit);
      if (!reached) continue;

      const triggerValue = hit?.running ?? 0;
      const finalValue = accountDay.final;
      daysReached += 1;
      totalEndOfDayPnl += finalValue;
      totalPullbackFromTrigger += Math.max(triggerValue - finalValue, 0);
      totalRetention += triggerValue === 0 ? 0 : Math.max(Math.min(finalValue / triggerValue, 1), -1);

      if (finalValue >= threshold) {
        finishedAboveTarget += 1;
        dayOutcomes.push({ day: accountDay.day, triggerValue, finalValue, outcome: 'above_target' });
      } else if (finalValue >= 0) {
        finishedBelowTarget += 1;
        dayOutcomes.push({ day: accountDay.day, triggerValue, finalValue, outcome: 'below_target' });
      } else {
        finishedRed += 1;
        dayOutcomes.push({ day: accountDay.day, triggerValue, finalValue, outcome: 'red' });
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

const backtestStopTargets = (accountDays: AccountDayPath[]) => {
  const maxPeak = Math.max(0, ...accountDays.map((item) => item.peak));
  const thresholdsToTest: number[] = [];
  for (let threshold = 100; threshold <= Math.ceil(maxPeak / 25) * 25; threshold += 25) {
    thresholdsToTest.push(threshold);
  }

  const results: StopTargetBacktest[] = thresholdsToTest.map((threshold) => {
    let reachedDays = 0;
    let totalRealized = 0;
    let totalActualFinal = 0;
    let betterThanActualDays = 0;
    let worseThanActualDays = 0;
    let unchangedDays = 0;
    let totalDelta = 0;
    let totalRealizedOnReachedDays = 0;
    let totalActualFinalOnReachedDays = 0;
    let totalDeltaOnReachedDays = 0;

    for (const accountDay of accountDays) {
      const hit = accountDay.path.find((point) => point.running >= threshold);
      const realized = hit ? hit.running : accountDay.final;

      if (hit) {
        reachedDays += 1;
        totalRealizedOnReachedDays += realized;
        totalActualFinalOnReachedDays += accountDay.final;
        totalDeltaOnReachedDays += realized - accountDay.final;
      }

      totalRealized += realized;
      totalActualFinal += accountDay.final;

      const delta = realized - accountDay.final;
      totalDelta += delta;

      if (delta > 0.009) {
        betterThanActualDays += 1;
      } else if (delta < -0.009) {
        worseThanActualDays += 1;
      } else {
        unchangedDays += 1;
      }
    }

    return {
      threshold,
      reachedDays,
      reachedPct: accountDays.length ? reachedDays / accountDays.length : 0,
      avgRealized: accountDays.length ? totalRealized / accountDays.length : 0,
      avgActualFinal: accountDays.length ? totalActualFinal / accountDays.length : 0,
      avgDelta: accountDays.length ? totalDelta / accountDays.length : 0,
      avgRealizedOnReachedDays: reachedDays ? totalRealizedOnReachedDays / reachedDays : 0,
      avgActualFinalOnReachedDays: reachedDays ? totalActualFinalOnReachedDays / reachedDays : 0,
      avgDeltaOnReachedDays: reachedDays ? totalDeltaOnReachedDays / reachedDays : 0,
      betterThanActualDays,
      worseThanActualDays,
      unchangedDays
    };
  });

  const recommended =
    results
      .slice()
      .sort((left, right) => right.avgRealized - left.avgRealized || left.threshold - right.threshold)[0] ?? null;

  const nearby = recommended
    ? results.filter((item) => item.threshold >= recommended.threshold - 50 && item.threshold <= recommended.threshold + 50)
    : [];

  return {
    totalAccountDays: accountDays.length,
    uniqueDays: new Set(accountDays.map((item) => item.day)).size,
    maxFinal: Math.max(0, ...accountDays.map((item) => item.final)),
    maxPeak,
    results,
    recommended,
    nearby
  };
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
  stopBacktest: ReturnType<typeof backtestStopTargets>,
  analyses: ThresholdAnalysis[],
  recommendedThreshold: ThresholdAnalysis | null,
  closeEarly: CloseEarlyAnalysis
) => ({
  focus: 'Per-account daily target coaching. The strongest recommendation should come from stop-rule backtesting: what would have happened if trading stopped once a target was first reached on each account-day.',
  testedThresholds: thresholds,
  notes: [
    'The target explorer table is descriptive. It shows what happened on days you reached a threshold and then kept trading.',
    'The stop target backtest is prescriptive. It simulates what would have happened if you had actually stopped once the threshold was first reached.',
    'The stop-rule backtest tests thresholds in $25 increments starting at $100.',
    'Finished Below Target means the day crossed the threshold at some point, then gave some back, but still closed green per account.',
    'Avg End Of Day P&L is the average per-account finish on days where that target was reached.',
    'Avg Pullback From Trigger is the average per-account drop from the first cross above the target to the day close.',
    'Kept % Of Trigger is the average share of the trigger value still retained by the close.'
  ],
  stopTargetBacktest: stopBacktest.recommended
    ? {
      threshold: stopBacktest.recommended.threshold,
      totalAccountDays: stopBacktest.totalAccountDays,
      uniqueDays: stopBacktest.uniqueDays,
      avgRealized: Number(stopBacktest.recommended.avgRealized.toFixed(2)),
      avgActualFinal: Number(stopBacktest.recommended.avgActualFinal.toFixed(2)),
      avgDelta: Number(stopBacktest.recommended.avgDelta.toFixed(2)),
      avgRealizedOnReachedDays: Number(stopBacktest.recommended.avgRealizedOnReachedDays.toFixed(2)),
      avgActualFinalOnReachedDays: Number(stopBacktest.recommended.avgActualFinalOnReachedDays.toFixed(2)),
      avgDeltaOnReachedDays: Number(stopBacktest.recommended.avgDeltaOnReachedDays.toFixed(2)),
      reachedDays: stopBacktest.recommended.reachedDays,
      reachedPct: Number((stopBacktest.recommended.reachedPct * 100).toFixed(1)),
      betterThanActualDays: stopBacktest.recommended.betterThanActualDays,
      worseThanActualDays: stopBacktest.recommended.worseThanActualDays,
      unchangedDays: stopBacktest.recommended.unchangedDays,
      nearby: stopBacktest.nearby.map((item) => ({
        threshold: item.threshold,
        avgRealized: Number(item.avgRealized.toFixed(2)),
        avgRealizedOnReachedDays: Number(item.avgRealizedOnReachedDays.toFixed(2)),
        avgActualFinalOnReachedDays: Number(item.avgActualFinalOnReachedDays.toFixed(2)),
        avgDeltaOnReachedDays: Number(item.avgDeltaOnReachedDays.toFixed(2)),
        avgDelta: Number(item.avgDelta.toFixed(2)),
        reachedDays: item.reachedDays
      }))
    }
    : null,
  suggestedDailyTargetPerAccount: recommendedThreshold
    ? {
        threshold: recommendedThreshold.threshold,
        daysReached: recommendedThreshold.daysReached,
        finishedAboveTarget: recommendedThreshold.finishedAboveTarget,
        finishedBelowTarget: recommendedThreshold.finishedBelowTarget,
        finishedRed: recommendedThreshold.finishedRed,
        avgEndOfDayPnl: Number(recommendedThreshold.avgEndOfDayPnl.toFixed(2)),
        avgPullbackFromTrigger: Number(recommendedThreshold.avgPullbackFromTrigger.toFixed(2)),
        keptPctOfTrigger: Number(recommendedThreshold.keptPctOfTrigger.toFixed(1)),
        dayOutcomes: recommendedThreshold.dayOutcomes
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
  const accountDays = useMemo(() => buildAccountDayPaths(trades), [trades]);
  const analyses = useMemo(() => analyzeThresholds(accountDays).filter((item) => item.daysReached > 0), [accountDays]);
  const stopBacktest = useMemo(() => backtestStopTargets(accountDays), [accountDays]);
  const closeEarly = analyzeCloseEarly(trades);
  const [question, setQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const recommendedThreshold = analyses
    .filter((item) => item.keptPctOfTrigger > 60)
    .sort((left, right) => {
      if (right.daysReached !== left.daysReached) return right.daysReached - left.daysReached;
      return right.keptPctOfTrigger - left.keptPctOfTrigger;
    })[0] ?? analyses[0] ?? null;
  const chatContext = useMemo(
    () => buildApprenticeContext(stopBacktest, analyses, recommendedThreshold, closeEarly),
    [analyses, closeEarly, recommendedThreshold, stopBacktest]
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
            <h3>Best Stop Target - Per Account</h3>
            <div className="value">{stopBacktest.recommended ? formatCurrency(stopBacktest.recommended.threshold) : 'Not enough data'}</div>
            <div className="sub">
              {stopBacktest.recommended
                ? `Backtested across ${stopBacktest.totalAccountDays} account-days. This is the stop level that would have produced the highest average realized per-account result.`
                : 'Import more trades so we can backtest where you should probably shut it down.'}
            </div>
          </div>
          <div className="card">
            <h3>Avg Finish On Hit Days</h3>
            <div className="value">{stopBacktest.recommended ? formatCurrency(stopBacktest.recommended.avgRealizedOnReachedDays) : '$0.00'}</div>
            <div className="sub">Average realized per-account finish on the days where this target was actually reached and you stopped there.</div>
          </div>
          <div className="card">
            <h3>Actual Finish On Hit Days</h3>
            <div className="value">{stopBacktest.recommended ? formatCurrency(stopBacktest.recommended.avgActualFinalOnReachedDays) : '$0.00'}</div>
            <div className="sub">What those same reached days actually finished at after you kept trading.</div>
          </div>
          <div className="card">
            <h3>Lock-In Lift On Hit Days</h3>
            <div className={`value ${(stopBacktest.recommended?.avgDeltaOnReachedDays ?? 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
              {stopBacktest.recommended ? formatCurrency(stopBacktest.recommended.avgDeltaOnReachedDays) : '$0.00'}
            </div>
            <div className="sub">Average extra realized per account on days that actually hit the target, compared with continuing to trade.</div>
          </div>
          <div className="card">
            <h3>Reach Rate</h3>
            <div className="value">
              {stopBacktest.recommended ? `${stopBacktest.recommended.reachedDays}/${stopBacktest.totalAccountDays}` : '0/0'}
            </div>
            <div className="sub">How often that stop target was actually reached across your imported per-account trading days.</div>
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
            <div className="section-title">Stop Target Backtest</div>
            <div className="sub">This is the recommendation engine: it simulates stopping for the day the first time each target was reached on an account.</div>
          </div>
          {loading ? (
            <div className="summary-panel">Backtesting stop targets...</div>
          ) : !stopBacktest.recommended ? (
            <div className="summary-panel">Not enough trading history yet to backtest a stop target.</div>
          ) : (
            <>
              <div className="summary-panel" style={{ marginBottom: '16px' }}>
                {`Best backtested target right now is ${formatCurrency(stopBacktest.recommended.threshold)} per account. On the days where you actually hit that level, stopping there would have locked in an average realized finish of ${formatCurrency(stopBacktest.recommended.avgRealizedOnReachedDays)} per account, versus ${formatCurrency(stopBacktest.recommended.avgActualFinalOnReachedDays)} on those same days when you kept trading. Across all imported account-days, that rule would have moved your average from ${formatCurrency(stopBacktest.recommended.avgActualFinal)} to ${formatCurrency(stopBacktest.recommended.avgRealized)} per account-day.`}
              </div>
              <table className="table apprentice-table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Days Reached</th>
                    <th>Reach Rate</th>
                    <th>Avg Finish On Hit Days</th>
                    <th>Actual Finish On Hit Days</th>
                    <th>Lock-In Lift On Hit Days</th>
                    <th>Overall Avg Across All Days</th>
                    <th>Better Days</th>
                    <th>Worse Days</th>
                  </tr>
                </thead>
                <tbody>
                  {stopBacktest.nearby.map((item) => (
                    <tr key={`stop-${item.threshold}`}>
                      <td>{formatCurrency(item.threshold)}</td>
                      <td>{item.reachedDays}</td>
                      <td>{(item.reachedPct * 100).toFixed(0)}%</td>
                      <td>{formatCurrency(item.avgRealizedOnReachedDays)}</td>
                      <td>{formatCurrency(item.avgActualFinalOnReachedDays)}</td>
                      <td className={item.avgDeltaOnReachedDays >= 0 ? 'pnl-positive' : 'pnl-negative'}>{formatCurrency(item.avgDeltaOnReachedDays)}</td>
                      <td>{formatCurrency(item.avgRealized)}</td>
                      <td>{item.betterThanActualDays}</td>
                      <td>{item.worseThanActualDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-header">
            <div className="section-title">Daily Target Explorer</div>
            <div className="sub">This section is descriptive, not prescriptive. It shows what happened after you kept trading on days that reached each target.</div>
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
