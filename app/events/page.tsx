'use client';

import { FormEvent, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { formatEventDateRange } from '../../lib/events';
import { useEventSourcingData } from '../../lib/useEventSourcingData';

const hbLabelMap = {
  pending_review: 'Pending HB check',
  claimed_in_hb: 'Claimed in HB',
  unclaimed_in_hb: 'Unclaimed in HB',
  not_in_hb: 'Not in HB',
  unknown: 'Unknown'
} as const;

const crmLabelMap = {
  not_added: 'Not in CRM',
  added_to_crm: 'Added to CRM',
  in_drip: 'In drip',
  paused: 'Paused'
} as const;

export default function EventsPage() {
  const { candidates, contacts, drafts, feedback, loading, error, usingDemoData, reload } = useEventSourcingData();
  const [message, setMessage] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [contactForm, setContactForm] = useState({
    candidateId: '',
    contactName: '',
    contactRole: '',
    contactEmail: '',
    contactPhone: '',
    linkedinUrl: '',
    contactSourceUrl: '',
    verificationStatus: 'verified',
    notes: ''
  });
  const [manualForm, setManualForm] = useState({
    organizationName: '',
    eventName: '',
    eventUrl: '',
    moreInfoUrl: '',
    city: '',
    country: 'United States',
    eventStartDate: '',
    eventEndDate: '',
    audienceSizeText: '',
    whyFit: '',
    aiSummary: '',
    notes: '',
    startAtTask3: true
  });

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) || candidates[0] || null;
  const selectedContacts = contacts.filter((contact) => contact.candidateId === selectedCandidate?.id);
  const selectedDrafts = drafts.filter((draft) => draft.candidateId === selectedCandidate?.id);

  const taskBuckets = useMemo(
    () => ({
      task1: candidates.filter((candidate) => candidate.workflowStage === 'event_candidates'),
      task2: candidates.filter((candidate) => candidate.workflowStage === 'hb_review'),
      task3: candidates.filter((candidate) => candidate.workflowStage === 'contact_research'),
      task4: candidates.filter((candidate) => candidate.workflowStage === 'crm_outreach'),
      disqualified: candidates.filter((candidate) => candidate.workflowStage === 'disqualified')
    }),
    [candidates]
  );

  const feedbackCounts = useMemo(
    () => ({
      total: feedback.length,
      competitor: feedback.filter((item) => item.feedbackLabel === 'competitor').length,
      notEventHost: feedback.filter((item) => item.feedbackLabel === 'not_event_host').length,
      goodFit: feedback.filter((item) => item.feedbackLabel === 'good_fit').length
    }),
    [feedback]
  );

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
    return result;
  };

  const runDiscovery = async () => {
    setMessage('Loading example event candidates...');
    try {
      const result = await postJson('/api/events/discover', {});
      setMessage(result.message || 'Discovery completed.');
      await reload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'Unable to run discovery.');
    }
  };

  const updateCandidate = async (candidateId: string, action: string) => {
    setMessage('Updating workflow...');
    try {
      await postJson('/api/events/review-candidates', { candidateId, action });
      setMessage('Candidate updated.');
      await reload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'Unable to update candidate.');
    }
  };

  const updateCrmStatus = async (candidateId: string, crmStatus: string) => {
    setMessage('Updating CRM status...');
    try {
      await postJson('/api/events/crm', { candidateId, crmStatus });
      setMessage('CRM status updated.');
      await reload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'Unable to update CRM status.');
    }
  };

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactMessage('Saving contact...');
    try {
      await postJson('/api/events/contacts', contactForm);
      setContactForm({
        candidateId: '',
        contactName: '',
        contactRole: '',
        contactEmail: '',
        contactPhone: '',
        linkedinUrl: '',
        contactSourceUrl: '',
        verificationStatus: 'verified',
        notes: ''
      });
      setContactMessage('Contact saved.');
      await reload();
    } catch (submitError) {
      setContactMessage(submitError instanceof Error ? submitError.message : 'Unable to save contact.');
    }
  };

  const submitManualCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualMessage('Saving manual prospect...');
    try {
      await postJson('/api/events/candidates', manualForm);
      setManualForm({
        organizationName: '',
        eventName: '',
        eventUrl: '',
        moreInfoUrl: '',
        city: '',
        country: 'United States',
        eventStartDate: '',
        eventEndDate: '',
        audienceSizeText: '',
        whyFit: '',
        aiSummary: '',
        notes: '',
        startAtTask3: true
      });
      setManualMessage('Manual prospect saved.');
      await reload();
    } catch (submitError) {
      setManualMessage(submitError instanceof Error ? submitError.message : 'Unable to save manual prospect.');
    }
  };

  const createDraft = async (candidateId: string, contactId?: string) => {
    setMessage('Generating outreach draft...');
    try {
      await postJson('/api/events/generate-outreach', { candidateId, contactId });
      setMessage('Outreach draft created.');
      await reload();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : 'Unable to generate outreach draft.');
    }
  };

  const submitFeedback = async (
    candidateId: string,
    feedbackLabel: 'good_fit' | 'competitor' | 'not_event_host' | 'low_value' | 'bad_data',
    notes: string
  ) => {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) return;

    setFeedbackMessage('Saving feedback...');
    try {
      await postJson('/api/events/feedback', {
        candidateId: candidate.id,
        sourceName: candidate.sourceName,
        eventName: candidate.eventName,
        eventUrl: candidate.eventUrl,
        organizationName: candidate.organizationName,
        feedbackLabel,
        notes
      });
      setFeedbackMessage('Feedback saved. Future discovery runs will use it.');
      await reload();
    } catch (submitError) {
      setFeedbackMessage(submitError instanceof Error ? submitError.message : 'Unable to save feedback.');
    }
  };

  const renderCandidateCard = (candidateId: string) => {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate) return null;

    return (
      <div
        key={candidate.id}
        style={{
          border: '1px solid rgba(140, 160, 200, 0.16)',
          borderRadius: '12px',
          padding: '14px',
          background: selectedCandidate?.id === candidate.id ? 'rgba(255,255,255,0.04)' : 'rgba(11, 15, 26, 0.45)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <div className="section-title" style={{ marginBottom: '8px', fontSize: '16px' }}>{candidate.eventName}</div>
            <div className="sub">{candidate.organizationName}</div>
            <div className="sub">{formatEventDateRange(candidate.eventStartDate, candidate.eventEndDate)} • {[candidate.city, candidate.country].filter(Boolean).join(', ') || 'Location TBD'}</div>
            <div className="sub">{candidate.audienceSizeText || 'Audience size not captured yet.'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="badge">{hbLabelMap[candidate.hbStatus]}</div>
            <div className="sub" style={{ marginTop: '8px' }}>Score {candidate.score}</div>
          </div>
        </div>
        <div className="sub" style={{ marginTop: '10px' }}>{candidate.whyFit || 'No fit rationale captured yet.'}</div>
        <div className="mini-callout" style={{ marginTop: '12px' }}>
          {candidate.aiSummary || 'AI summary not generated yet.'}
        </div>
        <div className="sub" style={{ marginTop: '10px' }}>
          Source: {candidate.sourceName}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button className="btn" onClick={() => setSelectedCandidateId(candidate.id)}>Open</button>
          {candidate.moreInfoUrl ? (
            <a className="btn" href={candidate.moreInfoUrl} target="_blank" rel="noreferrer">More Info</a>
          ) : null}
          <button
            className="btn"
            onClick={() => submitFeedback(candidate.id, 'good_fit', 'This looks like a viable hosted event prospect.')}
          >
            Good Fit
          </button>
          <button
            className="btn"
            onClick={() => submitFeedback(candidate.id, 'competitor', 'This is an association management firm or competitor service page, not a prospect event.')}
          >
            Competitor
          </button>
          <button
            className="btn"
            onClick={() => submitFeedback(candidate.id, 'not_event_host', 'This page does not represent a company or organization that actually hosts a major event.')}
          >
            Not Event Host
          </button>
          {candidate.workflowStage === 'event_candidates' ? (
            <button className="btn" onClick={() => updateCandidate(candidate.id, 'move_to_hb_review')}>Move To Task 2</button>
          ) : null}
          {candidate.workflowStage === 'hb_review' ? (
            <>
              <button className="btn" onClick={() => updateCandidate(candidate.id, 'mark_unclaimed_in_hb')}>HB Unclaimed</button>
              <button className="btn" onClick={() => updateCandidate(candidate.id, 'mark_not_in_hb')}>Not In HB</button>
              <button className="btn" onClick={() => updateCandidate(candidate.id, 'mark_claimed_in_hb')}>Already Claimed</button>
            </>
          ) : null}
          {candidate.workflowStage === 'contact_research' ? (
            <button className="btn" onClick={() => updateCandidate(candidate.id, 'move_to_crm_outreach')}>Move To Task 4</button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Event Sourcing</div>
            <div className="hero-subtitle">
              Task-based workflow for finding viable events, checking Helms Briscoe ownership, identifying planners, and moving approved prospects into CRM outreach.
            </div>
          </div>
          <button className="btn" onClick={runDiscovery}>Load Event Candidates</button>
        </div>

        {usingDemoData ? <div className="callout" style={{ marginBottom: '16px' }}>Running in demo mode until Supabase is updated.</div> : null}
        {loading ? <div className="callout" style={{ marginBottom: '16px' }}>Loading event workflow data...</div> : null}
        {error ? <div className="callout danger-callout" style={{ marginBottom: '16px' }}>{error}</div> : null}
        {message ? <div className="callout" style={{ marginBottom: '16px' }}>{message}</div> : null}
        {feedbackMessage ? <div className="callout" style={{ marginBottom: '16px' }}>{feedbackMessage}</div> : null}

        <div className="kpi-grid">
          <div className="card accent-card"><h3>Task 1</h3><div className="value">{taskBuckets.task1.length}</div><div className="sub">Event candidates</div></div>
          <div className="card"><h3>Task 2</h3><div className="value">{taskBuckets.task2.length}</div><div className="sub">HB validation queue</div></div>
          <div className="card"><h3>Task 3</h3><div className="value">{taskBuckets.task3.length}</div><div className="sub">Planner/contact research</div></div>
          <div className="card"><h3>Task 4</h3><div className="value">{taskBuckets.task4.length}</div><div className="sub">CRM and outreach staging</div></div>
        </div>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Crawler Feedback Layer</div>
            <div className="sub">Use quick feedback to improve future candidate quality</div>
          </div>
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div className="card"><h3>Total Feedback</h3><div className="value">{feedbackCounts.total}</div><div className="sub">Examples the crawler can learn from</div></div>
            <div className="card"><h3>Competitors</h3><div className="value">{feedbackCounts.competitor}</div><div className="sub">AMC and service-provider pages to suppress</div></div>
            <div className="card"><h3>Not Event Host</h3><div className="value">{feedbackCounts.notEventHost}</div><div className="sub">Pages that are not real hosted-event prospects</div></div>
            <div className="card"><h3>Good Fits</h3><div className="value">{feedbackCounts.goodFit}</div><div className="sub">Patterns worth favoring on future crawls</div></div>
          </div>
        </section>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Task 1: Event Candidates</div>
            <div className="sub">Find good-fit events and capture more info plus AI summary</div>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {taskBuckets.task1.map((candidate) => renderCandidateCard(candidate.id))}
            {!taskBuckets.task1.length ? <div className="sub">No Task 1 candidates right now.</div> : null}
          </div>
        </section>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Task 2: HB Validation</div>
            <div className="sub">Confirm whether the event is already claimed in Helms Briscoe</div>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {taskBuckets.task2.map((candidate) => renderCandidateCard(candidate.id))}
            {!taskBuckets.task2.length ? <div className="sub">No candidates waiting on HB validation.</div> : null}
          </div>
        </section>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Task 3: Find Planner And Contact Info</div>
            <div className="sub">Used for unclaimed HB prospects and manual starts</div>
          </div>
          {contactMessage ? <div className="callout" style={{ marginBottom: '12px' }}>{contactMessage}</div> : null}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
            {taskBuckets.task3.map((candidate) => renderCandidateCard(candidate.id))}
            {!taskBuckets.task3.length ? <div className="sub">No candidates currently in Task 3.</div> : null}
          </div>
          <form onSubmit={submitContact}>
            <div className="form-row">
              <div>
                <div className="field-label">Candidate</div>
                <select className="select" value={contactForm.candidateId} onChange={(event) => setContactForm((current) => ({ ...current, candidateId: event.target.value }))}>
                  <option value="">Select candidate</option>
                  {candidates.filter((candidate) => candidate.workflowStage === 'contact_research').map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.organizationName} - {candidate.eventName}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="field-label">Verification</div>
                <select className="select" value={contactForm.verificationStatus} onChange={(event) => setContactForm((current) => ({ ...current, verificationStatus: event.target.value }))}>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <input className="input" placeholder="Contact name" value={contactForm.contactName} onChange={(event) => setContactForm((current) => ({ ...current, contactName: event.target.value }))} />
              <input className="input" placeholder="Role" value={contactForm.contactRole} onChange={(event) => setContactForm((current) => ({ ...current, contactRole: event.target.value }))} />
              <input className="input" placeholder="Email" value={contactForm.contactEmail} onChange={(event) => setContactForm((current) => ({ ...current, contactEmail: event.target.value }))} />
            </div>
            <div className="form-row">
              <input className="input" placeholder="Phone" value={contactForm.contactPhone} onChange={(event) => setContactForm((current) => ({ ...current, contactPhone: event.target.value }))} />
              <input className="input" placeholder="LinkedIn URL" value={contactForm.linkedinUrl} onChange={(event) => setContactForm((current) => ({ ...current, linkedinUrl: event.target.value }))} />
              <input className="input" placeholder="Source URL" value={contactForm.contactSourceUrl} onChange={(event) => setContactForm((current) => ({ ...current, contactSourceUrl: event.target.value }))} />
            </div>
            <textarea className="input" rows={3} placeholder="Contact research notes" value={contactForm.notes} onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))} />
            <div style={{ marginTop: '12px' }}>
              <button className="btn" type="submit">Save Contact</button>
            </div>
          </form>
        </section>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Task 4: CRM And Drip Outreach</div>
            <div className="sub">Add approved prospects to CRM and queue outreach</div>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {taskBuckets.task4.map((candidate) => (
              <div key={candidate.id} style={{ border: '1px solid rgba(140, 160, 200, 0.16)', borderRadius: '12px', padding: '12px' }}>
                <strong>{candidate.organizationName} - {candidate.eventName}</strong>
                <div className="sub">{crmLabelMap[candidate.crmStatus]}</div>
                <div className="sub">{candidate.plannerName || 'No verified planner yet'}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <button className="btn" onClick={() => updateCrmStatus(candidate.id, 'added_to_crm')}>Mark In CRM</button>
                  <button className="btn" onClick={() => updateCrmStatus(candidate.id, 'in_drip')}>Mark In Drip</button>
                  <button
                    className="btn"
                    onClick={() => createDraft(candidate.id, contacts.find((contact) => contact.candidateId === candidate.id)?.id)}
                  >
                    Create Draft
                  </button>
                </div>
              </div>
            ))}
            {!taskBuckets.task4.length ? <div className="sub">No candidates ready for CRM or outreach yet.</div> : null}
          </div>
          <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            {selectedDrafts.map((draft) => (
              <div key={draft.id} style={{ border: '1px solid rgba(140, 160, 200, 0.16)', borderRadius: '12px', padding: '12px' }}>
                <strong>{draft.subjectLine}</strong>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '12px 0 0 0', color: 'var(--ink-dim)' }}>{draft.messageBody}</pre>
              </div>
            ))}
          </div>
        </section>

        <div className="dashboard-grid lower-grid">
          <section className="card">
            <div className="section-header">
              <div className="section-title">Manual Prospect Intake</div>
              <div className="sub">Optional path to load prospects manually and start at Task 3</div>
            </div>
            {manualMessage ? <div className="callout" style={{ marginBottom: '12px' }}>{manualMessage}</div> : null}
            <form onSubmit={submitManualCandidate}>
              <div className="form-row">
                <input className="input" placeholder="Organization name" value={manualForm.organizationName} onChange={(event) => setManualForm((current) => ({ ...current, organizationName: event.target.value }))} />
                <input className="input" placeholder="Event name" value={manualForm.eventName} onChange={(event) => setManualForm((current) => ({ ...current, eventName: event.target.value }))} />
                <input className="input" placeholder="Event URL" value={manualForm.eventUrl} onChange={(event) => setManualForm((current) => ({ ...current, eventUrl: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="More info URL" value={manualForm.moreInfoUrl} onChange={(event) => setManualForm((current) => ({ ...current, moreInfoUrl: event.target.value }))} />
                <input className="input" placeholder="City" value={manualForm.city} onChange={(event) => setManualForm((current) => ({ ...current, city: event.target.value }))} />
                <input className="input" placeholder="Country" value={manualForm.country} onChange={(event) => setManualForm((current) => ({ ...current, country: event.target.value }))} />
              </div>
              <div className="form-row">
                <input className="input" placeholder="Start date (YYYY-MM-DD)" value={manualForm.eventStartDate} onChange={(event) => setManualForm((current) => ({ ...current, eventStartDate: event.target.value }))} />
                <input className="input" placeholder="End date (YYYY-MM-DD)" value={manualForm.eventEndDate} onChange={(event) => setManualForm((current) => ({ ...current, eventEndDate: event.target.value }))} />
                <input className="input" placeholder="Audience size" value={manualForm.audienceSizeText} onChange={(event) => setManualForm((current) => ({ ...current, audienceSizeText: event.target.value }))} />
              </div>
              <textarea className="input" rows={3} placeholder="Why it fits" value={manualForm.whyFit} onChange={(event) => setManualForm((current) => ({ ...current, whyFit: event.target.value }))} />
              <textarea className="input" rows={3} placeholder="AI summary or operator summary" value={manualForm.aiSummary} onChange={(event) => setManualForm((current) => ({ ...current, aiSummary: event.target.value }))} />
              <textarea className="input" rows={3} placeholder="Notes" value={manualForm.notes} onChange={(event) => setManualForm((current) => ({ ...current, notes: event.target.value }))} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                <input id="startAtTask3" type="checkbox" checked={manualForm.startAtTask3} onChange={(event) => setManualForm((current) => ({ ...current, startAtTask3: event.target.checked }))} />
                <label htmlFor="startAtTask3">Start this manual prospect at Task 3</label>
              </div>
              <div style={{ marginTop: '12px' }}>
                <button className="btn" type="submit">Save Manual Prospect</button>
              </div>
            </form>
          </section>

          <section className="card stat-stack">
            <div className="section-title">Selected Prospect</div>
            {selectedCandidate ? (
              <>
                <div className="metric-row"><span>Organization</span><strong>{selectedCandidate.organizationName}</strong></div>
                <div className="metric-row"><span>HB status</span><strong>{hbLabelMap[selectedCandidate.hbStatus]}</strong></div>
                <div className="metric-row"><span>CRM status</span><strong>{crmLabelMap[selectedCandidate.crmStatus]}</strong></div>
                <div className="metric-row"><span>Intake source</span><strong>{selectedCandidate.intakeSource}</strong></div>
                <div className="mini-callout">{selectedCandidate.notes || 'No operator notes yet.'}</div>
                {selectedCandidate.moreInfoUrl ? <a className="btn" href={selectedCandidate.moreInfoUrl} target="_blank" rel="noreferrer">Open More Info</a> : null}
              </>
            ) : (
              <div className="sub">Select a prospect to inspect details.</div>
            )}
            {!!selectedContacts.length && (
              <div>
                <div className="section-title" style={{ marginTop: '16px' }}>Contacts</div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {selectedContacts.map((contact) => (
                    <div key={contact.id} style={{ border: '1px solid rgba(140, 160, 200, 0.16)', borderRadius: '12px', padding: '12px' }}>
                      <strong>{contact.contactName}</strong>
                      <div className="sub">{contact.contactRole || 'Role TBD'}</div>
                      <div className="sub">{contact.contactEmail || 'Email not captured yet'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!!feedback.length && (
              <div>
                <div className="section-title" style={{ marginTop: '16px' }}>Recent Feedback</div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {feedback.slice(0, 5).map((item) => (
                    <div key={item.id} style={{ border: '1px solid rgba(140, 160, 200, 0.16)', borderRadius: '12px', padding: '12px' }}>
                      <strong>{item.feedbackLabel}</strong>
                      <div className="sub">{item.eventName || item.organizationName || item.sourceName || 'Feedback item'}</div>
                      <div className="sub">{item.notes || 'No notes'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
