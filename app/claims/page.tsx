'use client';

import { FormEvent, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import {
  canPrepareClaim,
  daysUntilDeadline,
  formatShortDate,
  matchReadinessLabel,
  settlementRiskLabel
} from '../../lib/claims';
import { useClaimsData } from '../../lib/useClaimsData';

const statusLabelMap = {
  monitoring: 'Monitoring',
  ready_for_review: 'Ready for review',
  collecting_consents: 'Collecting consents',
  submitting: 'Submitting',
  closed: 'Closed'
} as const;

const submissionLabelMap = {
  draft: 'Draft',
  awaiting_attestation: 'Awaiting attestation',
  submitted: 'Submitted',
  follow_up_needed: 'Follow-up needed',
  rejected: 'Rejected'
} as const;

export default function ClaimsPage() {
  const { settlements, claimants, matches, submissions, sources, discoveryCandidates, readyMatches, loading, error, usingDemoData, reload } = useClaimsData();
  const [formMessage, setFormMessage] = useState('');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<Array<{
    seedName: string;
    seedUrl: string;
    fetched: boolean;
    status: number | null;
    error?: string;
    candidates: Array<{ title: string; url: string; sourceName: string }>;
  }>>([]);
  const [discoveryForm, setDiscoveryForm] = useState({
    saveToQueue: true,
    limitPerSeed: 8
  });
  const [sourceMessage, setSourceMessage] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [summaryMessage, setSummaryMessage] = useState('');
  const [candidateSummaries, setCandidateSummaries] = useState<Record<string, string>>({});
  const [sourceForm, setSourceForm] = useState({
    sourceName: '',
    sourceUrl: '',
    fetchFrequencyLabel: 'Daily',
    isActive: true
  });
  const [fetchMessage, setFetchMessage] = useState('');
  const [fetchForm, setFetchForm] = useState({
    sourceName: 'URL ingestion',
    sourceUrl: '',
    saveIngestion: true
  });
  const [extractMessage, setExtractMessage] = useState('');
  const [extractForm, setExtractForm] = useState({
    sourceUrl: '',
    rawInput: ''
  });
  const [settlementForm, setSettlementForm] = useState({
    sourceName: 'Manual intake',
    caseName: '',
    defendant: '',
    claimFormUrl: '',
    sourceUrl: '',
    filingDeadline: '',
    purchaseStart: '',
    purchaseEnd: '',
    noticeExcerpt: '',
    classDefinition: '',
    cashPayment: '',
    jurisdictions: 'US',
    excludedGroups: '',
    status: 'monitoring',
    proofRequired: false,
    attestationRequired: true
  });
  const [claimantForm, setClaimantForm] = useState({
    fullName: '',
    email: '',
    statesOfResidence: '',
    merchants: '',
    brandsUsed: '',
    notes: '',
    consentOnFile: false,
    consentScope: 'notification_only'
  });
  const [matchForm, setMatchForm] = useState({
    settlementId: '',
    claimantId: '',
    matchScore: '75',
    matchBasis: '',
    purchaseEvidenceStatus: 'missing',
    consentStatus: 'missing',
    reviewStatus: 'queued',
    riskFlags: '',
    eligibilityNotes: ''
  });

  const prooflessSettlements = settlements.filter((settlement) => !settlement.proofRequired);
  const urgentSettlements = settlements.filter((settlement) => daysUntilDeadline(settlement.filingDeadline) <= 14);
  const consentBlocked = matches.filter((match) => match.consentStatus !== 'granted');
  const reviewQueue = discoveryCandidates.filter((candidate) => candidate.discoveryStatus === 'discovered' || candidate.discoveryStatus === 'approved');

  const postJson = async (url: string, payload: unknown) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || 'Request failed.');
    }
  };

  const submitSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('Saving settlement...');

    try {
      await postJson('/api/claims/settlements', settlementForm);
      setSettlementForm({
        sourceName: 'Manual intake',
        caseName: '',
        defendant: '',
        claimFormUrl: '',
        sourceUrl: '',
        filingDeadline: '',
        purchaseStart: '',
        purchaseEnd: '',
        noticeExcerpt: '',
        classDefinition: '',
        cashPayment: '',
        jurisdictions: 'US',
        excludedGroups: '',
        status: 'monitoring',
        proofRequired: false,
        attestationRequired: true
      });
      setFormMessage('Settlement saved.');
      await reload();
    } catch (submitError) {
      setFormMessage(submitError instanceof Error ? submitError.message : 'Unable to save settlement.');
    }
  };

  const submitSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSourceMessage('Saving source...');

    try {
      await postJson('/api/claims/sources', sourceForm);
      setSourceForm({
        sourceName: '',
        sourceUrl: '',
        fetchFrequencyLabel: 'Daily',
        isActive: true
      });
      setSourceMessage('Source saved.');
      await reload();
    } catch (submitError) {
      setSourceMessage(submitError instanceof Error ? submitError.message : 'Unable to save source.');
    }
  };

  const extractSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setExtractMessage('Extracting settlement fields...');

    try {
      const response = await fetch('/api/claims/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(extractForm)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Extraction failed.');
      }

      setSettlementForm(result.draft);
      setExtractMessage('Draft extracted. Review the fields and save when ready.');
    } catch (submitError) {
      setExtractMessage(submitError instanceof Error ? submitError.message : 'Unable to extract settlement fields.');
    }
  };

  const fetchSettlementFromUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFetchMessage('Fetching and extracting notice...');

    try {
      const response = await fetch('/api/claims/ingest-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fetchForm)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'URL ingestion failed.');
      }

      setSettlementForm(result.draft);
      setExtractForm((current) => ({ ...current, sourceUrl: fetchForm.sourceUrl }));
      setFetchMessage(
        result.ingestionId
          ? `Fetched successfully and logged ingestion ${result.ingestionId}. Review the draft below before saving.`
          : 'Fetched successfully. Review the draft below before saving.'
      );
    } catch (submitError) {
      setFetchMessage(submitError instanceof Error ? submitError.message : 'Unable to fetch notice URL.');
    }
  };

  const processSourceQueue = async () => {
    setSourceMessage('Processing active sources...');

    try {
      const response = await fetch('/api/claims/process-sources', {
        method: 'POST'
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to process source queue.');
      }

      setSourceMessage(`Processed ${result.count} active source${result.count === 1 ? '' : 's'}.`);
      await reload();
    } catch (submitError) {
      setSourceMessage(submitError instanceof Error ? submitError.message : 'Unable to process source queue.');
    }
  };

  const runDiscovery = async () => {
    setDiscoveryMessage('Running discovery crawl...');

    try {
      const response = await fetch('/api/claims/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discoveryForm)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Discovery failed.');
      }

      setDiscoveryResults(result.discovered ?? []);
      setDiscoveryMessage('Discovery complete. Review the candidate links below.');
      if (discoveryForm.saveToQueue) {
        await reload();
      }
    } catch (submitError) {
      setDiscoveryMessage(submitError instanceof Error ? submitError.message : 'Unable to run discovery.');
    }
  };

  const reviewCandidate = async (candidateId: string, action: 'claim' | 'approve' | 'reject') => {
    if (usingDemoData) {
      setReviewMessage('Review actions are disabled while the page is showing demo data. Load the claims schema in Supabase first.');
      return;
    }

    setReviewMessage(
      action === 'claim'
        ? 'Creating claim-ready draft...'
        : action === 'approve'
          ? 'Approving candidate...'
          : 'Rejecting candidate...'
    );

    try {
      const response = await fetch('/api/claims/review-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateId,
          action
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to review candidate.');
      }

      if (action === 'claim') {
        setReviewMessage(
          result.ingestionResult?.settlementCreated
            ? 'Claim draft created and settlement ingested. No claim was submitted yet.'
            : 'Candidate promoted and processed. Review the resulting settlement next.'
        );
      } else {
        setReviewMessage(action === 'approve' ? 'Candidate promoted to source queue.' : 'Candidate rejected.');
      }

      await reload();
    } catch (submitError) {
      setReviewMessage(submitError instanceof Error ? submitError.message : 'Unable to review candidate.');
    }
  };

  const summarizeCandidate = async (candidateId: string, candidateTitle: string, candidateUrl: string) => {
    setSummaryMessage('Generating summary...');

    try {
      const response = await fetch('/api/claims/summarize-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateTitle,
          candidateUrl
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to summarize candidate.');
      }

      setCandidateSummaries((current) => ({
        ...current,
        [candidateId]: result.summary
      }));
      setSummaryMessage('Summary ready.');
    } catch (submitError) {
      setSummaryMessage(submitError instanceof Error ? submitError.message : 'Unable to summarize candidate.');
    }
  };

  const submitClaimant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('Saving claimant...');

    try {
      await postJson('/api/claims/claimants', claimantForm);
      setClaimantForm({
        fullName: '',
        email: '',
        statesOfResidence: '',
        merchants: '',
        brandsUsed: '',
        notes: '',
        consentOnFile: false,
        consentScope: 'notification_only'
      });
      setFormMessage('Claimant saved.');
      await reload();
    } catch (submitError) {
      setFormMessage(submitError instanceof Error ? submitError.message : 'Unable to save claimant.');
    }
  };

  const submitMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('Saving review match...');

    try {
      await postJson('/api/claims/matches', {
        ...matchForm,
        matchScore: Number(matchForm.matchScore)
      });
      setMatchForm({
        settlementId: '',
        claimantId: '',
        matchScore: '75',
        matchBasis: '',
        purchaseEvidenceStatus: 'missing',
        consentStatus: 'missing',
        reviewStatus: 'queued',
        riskFlags: '',
        eligibilityNotes: ''
      });
      setFormMessage('Review match saved.');
      await reload();
    } catch (submitError) {
      setFormMessage(submitError instanceof Error ? submitError.message : 'Unable to save match.');
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row claims-header">
          <div>
            <div className="h1">Claims Ops</div>
            <div className="hero-subtitle">
              Scan class settlements, match likely claimants, and prepare submissions only after explicit attestation.
            </div>
          </div>
          <div className="claims-header-actions">
            <div className={`badge ${usingDemoData ? 'badge-warning' : ''}`}>
              {usingDemoData ? 'Demo pipeline data' : 'Live Supabase data'}
            </div>
          </div>
        </div>

        {error && (
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="section-title">Data Status</div>
            <div className="sub">
              Claims tables are not available yet, so the page is showing seeded demo records. Error: {error}
            </div>
          </div>
        )}

        <div className="kpi-grid">
          <div className="card">
            <h3>Open Settlements</h3>
            <div className="value">{settlements.length}</div>
            <div className="sub">Monitored cases in the intake queue</div>
          </div>
          <div className="card">
            <h3>No-Proof Cases</h3>
            <div className="value">{prooflessSettlements.length}</div>
            <div className="sub">Still require truthful class eligibility</div>
          </div>
          <div className="card">
            <h3>Ready To Prepare</h3>
            <div className="value">{readyMatches.length}</div>
            <div className="sub">Consent granted and proof checks satisfied</div>
          </div>
          <div className="card">
            <h3>Consent Blocked</h3>
            <div className="value">{consentBlocked.length}</div>
            <div className="sub">Do not submit until the claimant confirms</div>
          </div>
          <div className="card">
            <h3>Tracked Sources</h3>
            <div className="value">{sources.length}</div>
            <div className="sub">URLs queued for recurring ingestion</div>
          </div>
        </div>

        <section className="card">
          <div className="section-header">
            <div className="section-title">Discovery Crawl</div>
            <div className="sub">Search curated settlement feeds and push candidates into the source queue</div>
          </div>
          <div className="form-row">
            <input
              className="input"
              type="number"
              min="1"
              max="25"
              value={discoveryForm.limitPerSeed}
              onChange={(event) => setDiscoveryForm((current) => ({ ...current, limitPerSeed: Number(event.target.value || 8) }))}
            />
          </div>
          <div className="checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={discoveryForm.saveToQueue}
                onChange={(event) => setDiscoveryForm((current) => ({ ...current, saveToQueue: event.target.checked }))}
              />
              Save discovered candidates into Source Queue
            </label>
          </div>
          <div className="button-row">
            <button className="btn" type="button" onClick={runDiscovery}>Run discovery</button>
          </div>
          {discoveryMessage && <div className="callout" style={{ marginTop: '12px' }}>{discoveryMessage}</div>}
          {discoveryResults.length > 0 && (
            <div className="claims-list compact-list" style={{ marginTop: '14px' }}>
              {discoveryResults.map((result) => (
                <article key={result.seedName} className="claim-card compact-card">
                  <div className="claim-card-topline">
                    <div>
                      <div className="claim-card-title">{result.seedName}</div>
                      <div className="sub">{result.seedUrl}</div>
                    </div>
                    <span className={`badge ${result.fetched ? '' : 'badge-danger'}`}>
                      {result.fetched ? `${result.candidates.length} candidates` : 'Fetch failed'}
                    </span>
                  </div>
                  {result.error && <div className="sub" style={{ marginBottom: '10px' }}>{result.error}</div>}
                  <div className="claims-list compact-list">
                    {result.candidates.slice(0, 6).map((candidate) => (
                      <div key={candidate.url} className="checklist-item">
                        <div>{candidate.title}</div>
                        <div className="sub">{candidate.url}</div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-header">
            <div className="section-title">Discovery Review Queue</div>
            <div className="sub">Score and filter discovered links before they become active sources</div>
          </div>
          {usingDemoData && (
            <div className="callout" style={{ marginBottom: '12px' }}>
              These review rows are sample data. Load the latest claims schema in Supabase before using Claim, Queue only, or Reject.
            </div>
          )}
          {(reviewMessage || summaryMessage) && (
            <div className="callout" style={{ marginBottom: '12px' }}>
              {[reviewMessage, summaryMessage].filter(Boolean).join(' ')}
            </div>
          )}
          <div className="claims-list compact-list">
            {reviewQueue.length === 0 && (
              <div className="sub">No candidates awaiting review yet. Run discovery to populate this queue.</div>
            )}
            {reviewQueue.map((candidate) => (
              <article key={candidate.id} className="claim-card compact-card">
                <div className="claim-card-topline">
                  <div>
                    <div className="claim-card-title">{candidate.candidateTitle}</div>
                    <div className="sub">{candidate.candidateUrl}</div>
                  </div>
                  <div className="claim-card-badges">
                    <span className={`badge ${candidate.score >= 80 ? '' : 'badge-muted'}`}>Score {candidate.score}</span>
                    {candidate.isLikelyNoProof && <span className="badge">Likely no-proof</span>}
                    {candidate.isDuplicate && <span className="badge badge-danger">Duplicate</span>}
                  </div>
                </div>
                <div className="claim-meta-grid">
                  <div>
                    <div className="field-label">Seed</div>
                    <div>{candidate.seedName}</div>
                  </div>
                  <div>
                    <div className="field-label">Estimated payout</div>
                    <div>{candidate.estimatedPayout ?? 'Needs review'}</div>
                  </div>
                  <div>
                    <div className="field-label">Claim form</div>
                    <div>{candidate.hasClaimForm ? 'Found' : 'Not found'}</div>
                  </div>
                  <div>
                    <div className="field-label">Deadline</div>
                    <div>{candidate.hasDeadline ? 'Found' : 'Not found'}</div>
                  </div>
                </div>
                <div className="trade-tags" style={{ marginTop: '12px' }}>
                  {candidate.tags.map((tag) => (
                    <span key={tag} className="tag-chip">{tag}</span>
                  ))}
                </div>
                {candidate.notes && <div className="sub" style={{ marginTop: '10px' }}>{candidate.notes}</div>}
                {candidateSummaries[candidate.id] && (
                  <div className="summary-panel" style={{ marginTop: '12px' }}>
                    {candidateSummaries[candidate.id]}
                  </div>
                )}
                <div className="button-row" style={{ marginTop: '14px' }}>
                  <button className="btn" type="button" disabled={usingDemoData} onClick={() => reviewCandidate(candidate.id, 'claim')}>Claim</button>
                  <button className="btn secondary-btn" type="button" disabled={usingDemoData} onClick={() => reviewCandidate(candidate.id, 'approve')}>Queue only</button>
                  <button className="btn secondary-btn" type="button" disabled={usingDemoData} onClick={() => reviewCandidate(candidate.id, 'reject')}>Reject</button>
                  <button className="btn secondary-btn" type="button" onClick={() => summarizeCandidate(candidate.id, candidate.candidateTitle, candidate.candidateUrl)}>AI Summarize</button>
                  <a className="link-btn" href={candidate.candidateUrl} target="_blank" rel="noreferrer">More info</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="claims-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Settlement Intake</div>
              <div className="sub">Normalized notices and filing windows</div>
            </div>
            <div className="claims-list">
              {settlements.map((settlement) => (
                <article key={settlement.id} className="claim-card">
                  <div className="claim-card-topline">
                    <div>
                      <div className="claim-card-title">{settlement.caseName}</div>
                      <div className="sub">{settlement.defendant} via {settlement.sourceName}</div>
                    </div>
                    <div className="claim-card-badges">
                      <span className={`badge ${settlement.proofRequired ? 'badge-danger' : ''}`}>
                        {settlement.proofRequired ? 'Proof required' : 'No proof path'}
                      </span>
                      <span className="badge badge-muted">{statusLabelMap[settlement.status]}</span>
                    </div>
                  </div>
                  <p className="claim-copy">{settlement.noticeExcerpt ?? settlement.classDefinition}</p>
                  <div className="claim-meta-grid">
                    <div>
                      <div className="field-label">Deadline</div>
                      <div>{formatShortDate(settlement.filingDeadline)}</div>
                    </div>
                    <div>
                      <div className="field-label">Estimated payout</div>
                      <div>{settlement.cashPayment ?? 'See notice'}</div>
                    </div>
                    <div>
                      <div className="field-label">Risk</div>
                      <div>{settlementRiskLabel(settlement)}</div>
                    </div>
                  </div>
                  <div className="claim-card-links">
                    <a href={settlement.sourceUrl} target="_blank" rel="noreferrer">Notice</a>
                    <a href={settlement.claimFormUrl} target="_blank" rel="noreferrer">Claim form</a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Risk Controls</div>
              <div className="sub">Guardrails for a compliant filing flow</div>
            </div>
            <div className="compliance-stack">
              <div className="callout">
                No-proof claims still require a truthful basis that the claimant fits the class definition.
              </div>
              <div className="checklist">
                <div className="checklist-item">Store source notice text and the extracted class definition before matching.</div>
                <div className="checklist-item">Require claimant-specific consent scope: notify, prepare, or submit after confirmation.</div>
                <div className="checklist-item">Block submission whenever proof is required and receipts have not been uploaded.</div>
                <div className="checklist-item">Capture who attested, when they attested, and the exact payload submitted.</div>
              </div>
              <div className="metric-panel">
                <div className="metric-row">
                  <span>Urgent deadlines</span>
                  <strong>{urgentSettlements.length}</strong>
                </div>
                <div className="metric-row">
                  <span>Awaiting attestation</span>
                  <strong>{submissions.filter((item) => item.submissionStatus === 'awaiting_attestation').length}</strong>
                </div>
                <div className="metric-row">
                  <span>Claimants tracked</span>
                  <strong>{claimants.length}</strong>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="claims-grid lower-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Candidate Match Queue</div>
              <div className="sub">Likely matches ranked for review</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Claimant</th>
                  <th>Settlement</th>
                  <th>Score</th>
                  <th>Evidence</th>
                  <th>Consent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const claimant = claimants.find((item) => item.id === match.claimantId);
                  const settlement = settlements.find((item) => item.id === match.settlementId);

                  if (!claimant || !settlement) return null;

                  return (
                    <tr key={match.id}>
                      <td>
                        <div>{claimant.fullName}</div>
                        <div className="sub">{claimant.email}</div>
                      </td>
                      <td>
                        <div>{settlement.caseName}</div>
                        <div className="sub">{match.matchBasis.join(', ')}</div>
                      </td>
                      <td>{match.matchScore}</td>
                      <td>{match.purchaseEvidenceStatus.replaceAll('_', ' ')}</td>
                      <td>{match.consentStatus.replaceAll('_', ' ')}</td>
                      <td>
                        <span className={`badge ${canPrepareClaim(match, settlement) ? '' : 'badge-muted'}`}>
                          {matchReadinessLabel(match)}
                        </span>
                        {match.riskFlags.length > 0 && (
                          <div className="sub" style={{ marginTop: '6px' }}>
                            {match.riskFlags.join(' • ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Submission Queue</div>
              <div className="sub">What is ready, blocked, or already filed</div>
            </div>
            <div className="claims-list compact-list">
              {submissions.map((submission) => {
                const claimant = claimants.find((item) => item.id === submission.claimantId);
                const settlement = settlements.find((item) => item.id === submission.settlementId);

                if (!claimant || !settlement) return null;

                return (
                  <article key={submission.id} className="claim-card compact-card">
                    <div className="claim-card-topline">
                      <div>
                        <div className="claim-card-title">{claimant.fullName}</div>
                        <div className="sub">{settlement.caseName}</div>
                      </div>
                      <span className={`badge ${submission.submissionStatus === 'submitted' ? '' : 'badge-muted'}`}>
                        {submissionLabelMap[submission.submissionStatus]}
                      </span>
                    </div>
                    <div className="claim-meta-grid">
                      <div>
                        <div className="field-label">Filed</div>
                        <div>{formatShortDate(submission.submittedAt)}</div>
                      </div>
                      <div>
                        <div className="field-label">Confirmation</div>
                        <div>{submission.confirmationNumber ?? 'Pending'}</div>
                      </div>
                    </div>
                    <div className="sub">{submission.filingNotes}</div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="claims-grid lower-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Source Queue</div>
              <div className="sub">Track recurring notice URLs and run batch ingestion</div>
            </div>
            <form onSubmit={submitSource}>
              <div className="form-row">
                <input
                  className="input"
                  placeholder="Source label"
                  value={sourceForm.sourceName}
                  onChange={(event) => setSourceForm((current) => ({ ...current, sourceName: event.target.value }))}
                />
                <input
                  className="input"
                  placeholder="https://example.com/notices/feed"
                  value={sourceForm.sourceUrl}
                  onChange={(event) => setSourceForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                />
              </div>
              <div className="form-row">
                <input
                  className="input"
                  placeholder="Fetch frequency label"
                  value={sourceForm.fetchFrequencyLabel}
                  onChange={(event) => setSourceForm((current) => ({ ...current, fetchFrequencyLabel: event.target.value }))}
                />
              </div>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={sourceForm.isActive}
                    onChange={(event) => setSourceForm((current) => ({ ...current, isActive: event.target.checked }))}
                  />
                  Active source
                </label>
              </div>
              <div className="button-row">
                <button className="btn" type="submit">Save source</button>
                <button className="btn secondary-btn" type="button" onClick={processSourceQueue}>Run source queue</button>
              </div>
            </form>
            {sourceMessage && <div className="callout" style={{ marginTop: '12px' }}>{sourceMessage}</div>}
            <div className="claims-list compact-list" style={{ marginTop: '14px' }}>
              {sources.map((source) => (
                <article key={source.id} className="claim-card compact-card">
                  <div className="claim-card-topline">
                    <div>
                      <div className="claim-card-title">{source.sourceName}</div>
                      <div className="sub">{source.sourceUrl}</div>
                    </div>
                    <span className={`badge ${source.isActive ? '' : 'badge-muted'}`}>
                      {source.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="claim-meta-grid">
                    <div>
                      <div className="field-label">Frequency</div>
                      <div>{source.fetchFrequencyLabel ?? 'Manual'}</div>
                    </div>
                    <div>
                      <div className="field-label">Last status</div>
                      <div>{source.lastHttpStatus ?? 'Not run'}</div>
                    </div>
                    <div>
                      <div className="field-label">Last checked</div>
                      <div>{source.lastCheckedAt ? formatShortDate(source.lastCheckedAt.slice(0, 10)) : 'Never'}</div>
                    </div>
                  </div>
                  {source.lastError && <div className="sub" style={{ marginTop: '10px' }}>{source.lastError}</div>}
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Source URL Fetch</div>
              <div className="sub">Fetch a live notice page and convert it into a review draft</div>
            </div>
            <form onSubmit={fetchSettlementFromUrl}>
              <div className="form-row">
                <input
                  className="input"
                  placeholder="Source label"
                  value={fetchForm.sourceName}
                  onChange={(event) => setFetchForm((current) => ({ ...current, sourceName: event.target.value }))}
                />
                <input
                  className="input"
                  placeholder="https://example.com/notice"
                  value={fetchForm.sourceUrl}
                  onChange={(event) => setFetchForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                />
              </div>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={fetchForm.saveIngestion}
                    onChange={(event) => setFetchForm((current) => ({ ...current, saveIngestion: event.target.checked }))}
                  />
                  Save ingestion log
                </label>
              </div>
              <button className="btn" type="submit">Fetch and extract</button>
            </form>
            {fetchMessage && <div className="callout" style={{ marginTop: '12px' }}>{fetchMessage}</div>}
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Notice Ingestion</div>
              <div className="sub">Paste notice text or HTML to prefill a settlement draft</div>
            </div>
            <form onSubmit={extractSettlement}>
              <div className="form-row">
                <input
                  className="input"
                  placeholder="Optional source URL"
                  value={extractForm.sourceUrl}
                  onChange={(event) => setExtractForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                />
              </div>
              <textarea
                className="input ingest-input"
                placeholder="Paste notice text, claim administrator copy, or raw HTML here..."
                value={extractForm.rawInput}
                onChange={(event) => setExtractForm((current) => ({ ...current, rawInput: event.target.value }))}
              />
              <button className="btn" type="submit">Extract draft</button>
            </form>
            {extractMessage && <div className="callout" style={{ marginTop: '12px' }}>{extractMessage}</div>}
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Manual Settlement Intake</div>
              <div className="sub">Create normalized settlement records</div>
            </div>
            <form onSubmit={submitSettlement}>
              <div className="form-row">
                <input className="input" placeholder="Source name" value={settlementForm.sourceName} onChange={(event) => setSettlementForm((current) => ({ ...current, sourceName: event.target.value }))} />
                <input className="input" placeholder="Case name" value={settlementForm.caseName} onChange={(event) => setSettlementForm((current) => ({ ...current, caseName: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="Defendant" value={settlementForm.defendant} onChange={(event) => setSettlementForm((current) => ({ ...current, defendant: event.target.value }))} />
                <input className="input" placeholder="Claim form URL" value={settlementForm.claimFormUrl} onChange={(event) => setSettlementForm((current) => ({ ...current, claimFormUrl: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="Source URL" value={settlementForm.sourceUrl} onChange={(event) => setSettlementForm((current) => ({ ...current, sourceUrl: event.target.value }))} />
                <input className="input" type="date" value={settlementForm.filingDeadline} onChange={(event) => setSettlementForm((current) => ({ ...current, filingDeadline: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" type="date" value={settlementForm.purchaseStart} onChange={(event) => setSettlementForm((current) => ({ ...current, purchaseStart: event.target.value }))} />
                <input className="input" type="date" value={settlementForm.purchaseEnd} onChange={(event) => setSettlementForm((current) => ({ ...current, purchaseEnd: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="Estimated payout" value={settlementForm.cashPayment} onChange={(event) => setSettlementForm((current) => ({ ...current, cashPayment: event.target.value }))} />
                <input className="input" placeholder="Jurisdictions (comma separated)" value={settlementForm.jurisdictions} onChange={(event) => setSettlementForm((current) => ({ ...current, jurisdictions: event.target.value }))} />
              </div>
              <div className="form-row">
                <select className="select" value={settlementForm.status} onChange={(event) => setSettlementForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="monitoring">Monitoring</option>
                  <option value="ready_for_review">Ready for review</option>
                  <option value="collecting_consents">Collecting consents</option>
                  <option value="submitting">Submitting</option>
                  <option value="closed">Closed</option>
                </select>
                <input className="input" placeholder="Excluded groups" value={settlementForm.excludedGroups} onChange={(event) => setSettlementForm((current) => ({ ...current, excludedGroups: event.target.value }))} />
              </div>
              <textarea className="input note-input" placeholder="Notice excerpt" value={settlementForm.noticeExcerpt} onChange={(event) => setSettlementForm((current) => ({ ...current, noticeExcerpt: event.target.value }))} />
              <textarea className="input note-input" placeholder="Class definition" value={settlementForm.classDefinition} onChange={(event) => setSettlementForm((current) => ({ ...current, classDefinition: event.target.value }))} />
              <div className="checkbox-row">
                <label><input type="checkbox" checked={settlementForm.proofRequired} onChange={(event) => setSettlementForm((current) => ({ ...current, proofRequired: event.target.checked }))} /> Proof required</label>
                <label><input type="checkbox" checked={settlementForm.attestationRequired} onChange={(event) => setSettlementForm((current) => ({ ...current, attestationRequired: event.target.checked }))} /> Attestation required</label>
              </div>
              <button className="btn" type="submit">Save settlement</button>
            </form>
          </section>

          <section className="card">
            <div className="section-header">
              <div className="section-title">Claimant Intake</div>
              <div className="sub">Capture consent scope and matching attributes</div>
            </div>
            <form onSubmit={submitClaimant}>
              <div className="form-row">
                <input className="input" placeholder="Full name" value={claimantForm.fullName} onChange={(event) => setClaimantForm((current) => ({ ...current, fullName: event.target.value }))} />
                <input className="input" type="email" placeholder="Email" value={claimantForm.email} onChange={(event) => setClaimantForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="States of residence" value={claimantForm.statesOfResidence} onChange={(event) => setClaimantForm((current) => ({ ...current, statesOfResidence: event.target.value }))} />
                <input className="input" placeholder="Merchants" value={claimantForm.merchants} onChange={(event) => setClaimantForm((current) => ({ ...current, merchants: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="Brands used" value={claimantForm.brandsUsed} onChange={(event) => setClaimantForm((current) => ({ ...current, brandsUsed: event.target.value }))} />
                <select className="select" value={claimantForm.consentScope} onChange={(event) => setClaimantForm((current) => ({ ...current, consentScope: event.target.value }))}>
                  <option value="notification_only">Notification only</option>
                  <option value="prepare_only">Prepare only</option>
                  <option value="submit_with_confirmation">Submit with confirmation</option>
                </select>
              </div>
              <textarea className="input note-input" placeholder="Notes" value={claimantForm.notes} onChange={(event) => setClaimantForm((current) => ({ ...current, notes: event.target.value }))} />
              <div className="checkbox-row">
                <label><input type="checkbox" checked={claimantForm.consentOnFile} onChange={(event) => setClaimantForm((current) => ({ ...current, consentOnFile: event.target.checked }))} /> Consent already on file</label>
              </div>
              <button className="btn" type="submit">Save claimant</button>
            </form>
          </section>
        </div>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-header">
            <div className="section-title">Review Match Intake</div>
            <div className="sub">Log manual review results before claim prep</div>
          </div>
          <form onSubmit={submitMatch}>
            <div className="form-row">
              <select className="select" value={matchForm.settlementId} onChange={(event) => setMatchForm((current) => ({ ...current, settlementId: event.target.value }))}>
                <option value="">Select settlement</option>
                {settlements.map((settlement) => (
                  <option key={settlement.id} value={settlement.id}>{settlement.caseName}</option>
                ))}
              </select>
              <select className="select" value={matchForm.claimantId} onChange={(event) => setMatchForm((current) => ({ ...current, claimantId: event.target.value }))}>
                <option value="">Select claimant</option>
                {claimants.map((claimant) => (
                  <option key={claimant.id} value={claimant.id}>{claimant.fullName}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <input className="input" type="number" min="0" max="100" placeholder="Match score" value={matchForm.matchScore} onChange={(event) => setMatchForm((current) => ({ ...current, matchScore: event.target.value }))} />
              <input className="input" placeholder="Match basis" value={matchForm.matchBasis} onChange={(event) => setMatchForm((current) => ({ ...current, matchBasis: event.target.value }))} />
            </div>
            <div className="form-row">
              <select className="select" value={matchForm.purchaseEvidenceStatus} onChange={(event) => setMatchForm((current) => ({ ...current, purchaseEvidenceStatus: event.target.value }))}>
                <option value="missing">Missing</option>
                <option value="not_needed">Not needed</option>
                <option value="self_attested">Self attested</option>
                <option value="uploaded">Uploaded</option>
              </select>
              <select className="select" value={matchForm.consentStatus} onChange={(event) => setMatchForm((current) => ({ ...current, consentStatus: event.target.value }))}>
                <option value="missing">Missing</option>
                <option value="requested">Requested</option>
                <option value="granted">Granted</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
            <div className="form-row">
              <select className="select" value={matchForm.reviewStatus} onChange={(event) => setMatchForm((current) => ({ ...current, reviewStatus: event.target.value }))}>
                <option value="queued">Queued</option>
                <option value="ready">Ready</option>
                <option value="manual_review">Manual review</option>
                <option value="rejected">Rejected</option>
              </select>
              <input className="input" placeholder="Risk flags" value={matchForm.riskFlags} onChange={(event) => setMatchForm((current) => ({ ...current, riskFlags: event.target.value }))} />
            </div>
            <textarea className="input note-input" placeholder="Eligibility notes" value={matchForm.eligibilityNotes} onChange={(event) => setMatchForm((current) => ({ ...current, eligibilityNotes: event.target.value }))} />
            <button className="btn" type="submit">Save review match</button>
          </form>
          {formMessage && <div className="callout" style={{ marginTop: '12px' }}>{formMessage}</div>}
        </section>

        <section className="card" style={{ marginTop: '18px' }}>
          <div className="section-header">
            <div className="section-title">Recommended Next Build Steps</div>
            <div className="sub">From scaffold to working scanner and preparer</div>
          </div>
          <div className="checklist">
            <div className="checklist-item">Add a scraper worker with Playwright that stores notice HTML, PDFs, and normalized extraction outputs.</div>
            <div className="checklist-item">Create an admin intake form to review extracted rules before a settlement becomes active.</div>
            <div className="checklist-item">Add a claimant portal for consent collection and per-case attestation before final submission.</div>
            <div className="checklist-item">Implement browser automation only for prepared claims that have passed the consent and proof checks.</div>
          </div>
        </section>

        {loading && (
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="sub">Loading claims data...</div>
          </div>
        )}
      </main>
    </div>
  );
}
