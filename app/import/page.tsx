'use client';

import { ClipboardEvent, DragEvent, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { parseNinjaCsv } from '../../lib/csv';
import { buildTradeFingerprint } from '../../lib/tradeFingerprint';
import { matchTrades } from '../../lib/trades';
import { supabase } from '../../lib/supabase';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export default function ImportPage() {
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<{ files: number; trades: number; net: number; attempted: number; inserted: number; tableCount: number | null } | null>(null);
  const [defaultTags, setDefaultTags] = useState('');
  const [pastedCsv, setPastedCsv] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const parsedDefaultTags = defaultTags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const importCsvSources = async (sources: Array<{ name: string; text: string }>) => {
    if (sources.length === 0) return;
    setSummary(null);
    setStatus('Parsing files...');
    let totalTrades = 0;
    let totalNet = 0;
    let attemptedTrades = 0;
    let insertedTrades = 0;

    for (const source of sources) {
      const rows = parseNinjaCsv(source.text);
      const trades = matchTrades(rows, source.name);
      totalTrades += trades.length;
      attemptedTrades += trades.length;
      totalNet += trades.reduce((sum, t) => sum + t.netPnl, 0);

      if (trades.length === 0) {
        continue;
      }

      const payload = trades.map((trade) => ({
        account: trade.account,
        instrument: trade.instrument,
        side: trade.side,
        quantity: trade.quantity,
        entry_time: trade.entryTime.toISOString(),
        exit_time: trade.exitTime.toISOString(),
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        gross_pnl: trade.grossPnl,
        commission: trade.commission,
        net_pnl: trade.netPnl,
        trade_tags: parsedDefaultTags,
        trade_fingerprint: buildTradeFingerprint(trade),
        source_file: trade.sourceFile
      }));

      let upsertResult = await supabase
        .from('trades')
        .upsert(payload, {
          onConflict: 'trade_fingerprint',
          ignoreDuplicates: true
        })
        .select('id');
      let { error } = upsertResult;
      insertedTrades += upsertResult.data?.length ?? 0;
      if (error && error.message.includes('trade_tags')) {
        const fallbackPayload = payload.map(({ trade_tags, ...rest }) => rest);
        const fallback = await supabase
          .from('trades')
          .upsert(fallbackPayload, {
            onConflict: 'trade_fingerprint',
            ignoreDuplicates: true
          })
          .select('id');
        error = fallback.error;
        insertedTrades += fallback.data?.length ?? 0;
      }
      if (error) {
        setStatus(`Upload failed: ${error.message}`);
        return;
      }
    }

    const { count, error: countError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      setStatus(`Import complete, but row-count check failed: ${countError.message}`);
    } else {
      setStatus('Import complete.');
    }
    setSummary({
      files: sources.length,
      trades: totalTrades,
      net: totalNet,
      attempted: attemptedTrades,
      inserted: insertedTrades,
      tableCount: count ?? null
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const sources = await Promise.all(
      Array.from(files).map(async (file) => ({
        name: file.name,
        text: await file.text()
      }))
    );
    importCsvSources(sources);
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) {
      return;
    }
    await onFiles(event.dataTransfer.files);
  };

  const onPasteCsv = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData('text');
    if (text) {
      setPastedCsv(text);
    }
  };

  const importPastedCsv = async () => {
    if (!pastedCsv.trim()) {
      setSummary(null);
      setStatus('Paste CSV text first.');
      return;
    }
    await importCsvSources([{ name: 'pasted-trades.csv', text: pastedCsv }]);
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Import Trades</div>
            <div style={{ color: 'var(--ink-dim)' }}>Upload NinjaTrader export CSVs.</div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">CSV Upload</div>
          <div className="form-row">
            <input
              className="input"
              placeholder="Optional default tags, comma separated"
              value={defaultTags}
              onChange={(event) => setDefaultTags(event.target.value)}
            />
          </div>
          <div
            className="card"
            style={{
              marginBottom: '12px',
              borderStyle: 'dashed',
              background: dragActive ? 'rgba(42, 208, 127, 0.12)' : undefined
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <div className="section-title" style={{ marginBottom: '8px' }}>Drag And Drop CSVs</div>
            <div className="sub">Drag NinjaTrader export files here from your Windows side instead of using the Mac file picker.</div>
          </div>
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={(event) => onFiles(event.target.files)}
          />
          <div style={{ marginTop: '16px' }}>
            <div className="field-label">Paste CSV Text</div>
            <textarea
              className="input note-input"
              placeholder="Paste raw CSV text here if that is easier than moving files across..."
              value={pastedCsv}
              onChange={(event) => setPastedCsv(event.target.value)}
              onPaste={onPasteCsv}
            />
            <div style={{ marginTop: '12px' }}>
              <button className="btn" onClick={importPastedCsv}>Import pasted CSV</button>
            </div>
          </div>
          <div style={{ marginTop: '12px' }} className="callout">
            Point value defaults: ES=50, MES=5, NQ=20, MNQ=2. Unmapped instruments default to 1. Duplicate trade imports are skipped by a stable trade fingerprint once the fingerprint column exists in Supabase.
          </div>
        </div>

        {status && (
          <div style={{ marginTop: '16px' }} className="card">
            <div className="section-title">Status</div>
            <div>{status}</div>
            {summary && (
              <div className="sub" style={{ marginTop: '8px' }}>
                Processed {summary.files} files, matched {summary.attempted} trade rows, inserted {summary.inserted} row{summary.inserted === 1 ? '' : 's'}, and counted {summary.tableCount ?? 'unknown'} total trade row{summary.tableCount === 1 ? '' : 's'} in Supabase after import. Net from parsed trades: {formatCurrency(summary.net)}. Connected project: {new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname || 'unknown'}.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
