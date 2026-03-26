'use client';

import Sidebar from '../../components/Sidebar';

export default function TaxPrepPage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Tax Prep</div>
            <div className="hero-subtitle">Year-end filing prep, document checklists, and handoff notes for your CPA will live here.</div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Tax Prep Workspace Coming Next</div>
          <div className="summary-panel">We can use this area for quarterly estimates, filing document checklists, and a clean CPA handoff packet once we finish the bookkeeping layer.</div>
        </div>
      </main>
    </div>
  );
}
