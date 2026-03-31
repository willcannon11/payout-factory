'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import { groupCopiedTrades, TradeBundle } from '../../lib/tradeBundles';
import { useTradingData } from '../../lib/useTradingData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value);

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function TradesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trades, reload, loading, error } = useTradingData();
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedBundles, setSelectedBundles] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, { tags: string; note: string }>>({});
  const selectedDay = searchParams.get('day');

  const bundledTradeList = useMemo(() => {
    const bundles = groupCopiedTrades(trades);
    if (!selectedDay) {
      return bundles;
    }

    return bundles.filter((bundle) =>
      bundle.trades.some((trade) => toDateKey(trade.exitTime) === selectedDay)
    );
  }, [selectedDay, trades]);

  const allSelected =
    bundledTradeList.length > 0 && bundledTradeList.every((bundle) => selectedBundles[bundle.key]);

  const selectedTradeIds = bundledTradeList.flatMap((bundle) =>
    selectedBundles[bundle.key] ? bundle.trades.map((trade) => trade.id).filter(Boolean) as string[] : []
  );

  const saveBundle = async (bundle: TradeBundle) => {
    const tradeIds = bundle.trades.map((trade) => trade.id).filter(Boolean) as string[];
    if (tradeIds.length === 0) {
      return;
    }

    const draft = drafts[bundle.key] ?? { tags: '', note: '' };
    const tags = draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSavingId(bundle.key);
    const { error: updateError } = await supabase
      .from('trades')
      .update({
        trade_tags: tags,
        trade_note: draft.note || null
      })
      .in('id', tradeIds);

    setSavingId(null);

    if (updateError) {
      setMessage(`Save failed: ${updateError.message}`);
      return;
    }

    setMessage(`Bundle updated across ${tradeIds.length} account${tradeIds.length === 1 ? '' : 's'}.`);
    reload();
  };

  const toggleBundle = (bundleKey: string) => {
    setSelectedBundles((current) => ({
      ...current,
      [bundleKey]: !current[bundleKey]
    }));
  };

  const toggleAllBundles = () => {
    if (allSelected) {
      setSelectedBundles({});
      return;
    }

    setSelectedBundles(
      bundledTradeList.reduce((map, bundle) => {
        map[bundle.key] = true;
        return map;
      }, {} as Record<string, boolean>)
    );
  };

  const deleteSelectedBundles = async () => {
    if (selectedTradeIds.length === 0) {
      setMessage('Select at least one bundled trade to delete.');
      return;
    }

    if (!window.confirm(`Delete ${selectedTradeIds.length} trade${selectedTradeIds.length === 1 ? '' : 's'} across the selected bundle(s)? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    const chunkSize = 100;
    for (let index = 0; index < selectedTradeIds.length; index += chunkSize) {
      const chunk = selectedTradeIds.slice(index, index + chunkSize);
      const { error: deleteError } = await supabase.from('trades').delete().in('id', chunk);
      if (deleteError) {
        setDeleting(false);
        setMessage(`Delete failed: ${deleteError.message}`);
        return;
      }
    }
    setDeleting(false);

    setSelectedBundles({});
    setMessage(`Deleted ${selectedTradeIds.length} trade${selectedTradeIds.length === 1 ? '' : 's'}.`);
    reload();
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Trades</div>
            <div className="hero-subtitle">Tag setups, add notes, and turn raw fills into something you can learn from.</div>
          </div>
        </div>

        {selectedDay ? (
          <div className="callout" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>Showing only bundled trades for <strong>{selectedDay}</strong>.</div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => router.push('/trades')}
            >
              Clear Day Filter
            </button>
          </div>
        ) : null}

        {error ? <div className="callout danger-callout">{error}</div> : null}
        {message ? <div className="callout">{message}</div> : null}
        <div className="callout" style={{ marginBottom: '16px' }}>
          If trade tag saves fail, run the small `alter table` snippet in the README once so your existing `trades` table gets the new tag and note columns.
        </div>

        <section className="card">
          <div className="section-header">
            <div className="section-title">Trade Journal</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <label className="sub" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAllBundles} />
                Select all
              </label>
              <button type="button" className="btn secondary" onClick={deleteSelectedBundles} disabled={deleting || selectedTradeIds.length === 0}>
                {deleting ? 'Deleting...' : `Delete Selected${selectedTradeIds.length ? ` (${selectedTradeIds.length})` : ''}`}
              </button>
              <div className="sub">Copied trades across accounts are bundled into one journal card so you can tag them once.</div>
            </div>
          </div>
          <div className="trade-list">
            {bundledTradeList.map((bundle) => {
                const trade = bundle.representative;
                const uniqueAccounts = Array.from(new Set(bundle.accounts)).sort((left, right) => left.localeCompare(right));
                const draft = drafts[bundle.key] ?? {
                  tags: trade.tags.join(', '),
                  note: trade.note ?? ''
                };

                return (
                  <div key={bundle.key} className="trade-row-card">
                    <div className="trade-row-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedBundles[bundle.key])}
                          onChange={() => toggleBundle(bundle.key)}
                        />
                        <strong>{trade.instrument}</strong> · {trade.side} · {uniqueAccounts.length} account{uniqueAccounts.length === 1 ? '' : 's'}
                      </div>
                      <div className={bundle.totalNetPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                        {formatCurrency(bundle.totalNetPnl)}
                      </div>
                    </div>
                    <div className="sub">
                      {formatDateTime(trade.entryTime)} to {formatDateTime(trade.exitTime)} · Qty {trade.quantity} per account · Total Contracts {bundle.totalContracts}
                    </div>
                    <div className="sub" style={{ marginTop: '6px' }}>
                      Accounts: {uniqueAccounts.length} linked account{uniqueAccounts.length === 1 ? '' : 's'}
                    </div>
                    <div className="form-row" style={{ marginTop: '12px' }}>
                      <input
                        className="input"
                        placeholder="Tags: FibRectangle, Closed Early"
                        value={draft.tags}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [bundle.key]: {
                              ...draft,
                              tags: event.target.value
                            }
                          })
                        }
                      />
                    </div>
                    <textarea
                      className="input note-input"
                      placeholder="Trade note"
                      value={draft.note}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [bundle.key]: {
                            ...draft,
                            note: event.target.value
                          }
                        })
                      }
                    />
                    <div className="trade-tags">
                      {trade.tags.map((tag) => (
                        <span key={tag} className="tag-chip">{tag}</span>
                      ))}
                    </div>
                    <button className="btn" onClick={() => saveBundle(bundle)} disabled={savingId === bundle.key}>
                      {savingId === bundle.key ? 'Saving...' : `Save Bundle (${bundle.trades.length})`}
                    </button>
                  </div>
                );
              })}
          </div>
          {loading ? <div className="sub" style={{ marginTop: '12px' }}>Refreshing trades...</div> : null}
        </section>
      </main>
    </div>
  );
}

export default function TradesPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell">
          <Sidebar />
          <main className="main">
            <div className="header-row">
              <div>
                <div className="h1">Trades</div>
                <div className="hero-subtitle">Loading your trade journal...</div>
              </div>
            </div>
          </main>
        </div>
      }
    >
      <TradesPageContent />
    </Suspense>
  );
}
