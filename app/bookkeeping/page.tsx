'use client';

import Sidebar from '../../components/Sidebar';

export default function BookkeepingPage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Bookkeeping</div>
            <div className="hero-subtitle">Tax-friendly bookkeeping workflows, reconciliations, and export prep will live here.</div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Bookkeeping Workspace Coming Next</div>
          <div className="summary-panel">This section is scaffolded so we can add categorized expenses, income tagging, account reconciliation, and tax-ready exports without bending the trading pages into something else.</div>
        </div>
      </main>
    </div>
  );
}
