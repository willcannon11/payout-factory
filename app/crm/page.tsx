'use client';

import Sidebar from '../../components/Sidebar';

export default function CrmPage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">CRM</div>
            <div className="hero-subtitle">HelmsBriscoe pipeline, relationship tracking, and outbound follow-up will live here.</div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">CRM Workspace Coming Next</div>
          <div className="summary-panel">We now have the navigation hierarchy in place, so this page is ready to become the home for account tracking, outreach stages, deal notes, and follow-up prompts.</div>
        </div>
      </main>
    </div>
  );
}
