'use client';

import { ClipboardEvent, DragEvent, useState } from 'react';
import Sidebar from '../../components/Sidebar';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export default function ImportPage() {
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<{ files: number; trades: number; net: number; attempted: number; inserted: number; tableCount: number | null; projectHost: string } | null>(null);
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
    setStatus('Uploading and matching trades...');

    const response = await fetch('/api/trades/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sources,
        defaultTags: parsedDefaultTags
      })
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setSummary(null);
      setStatus(`Upload failed: ${result?.error ?? 'Unknown error'}`);
      return;
    }

    setStatus(result?.status ?? 'Import complete.');
    setSummary(result?.summary ?? null);
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
                Processed {summary.files} files, matched {summary.attempted} trade rows, inserted {summary.inserted} row{summary.inserted === 1 ? '' : 's'}, and counted {summary.tableCount ?? 'unknown'} total trade row{summary.tableCount === 1 ? '' : 's'} in Supabase after import. Net from parsed trades: {formatCurrency(summary.net)}. Connected project: {summary.projectHost}.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
