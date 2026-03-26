'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  demoEventFeedback,
  demoEventCandidates,
  demoEventContacts,
  demoOutreachDrafts,
  mapEventCandidateFeedbackRow,
  mapEventOutreachDraftRow,
  mapEventSourcingCandidateRow,
  mapEventSourcingContactRow
} from './events';
import {
  EventCandidateFeedback,
  EventCandidateFeedbackRow,
  EventOutreachDraft,
  EventOutreachDraftRow,
  EventSourcingCandidate,
  EventSourcingCandidateRow,
  EventSourcingContact,
  EventSourcingContactRow
} from './types';

const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const useEventSourcingData = () => {
  const [candidates, setCandidates] = useState<EventSourcingCandidate[]>(demoEventCandidates);
  const [contacts, setContacts] = useState<EventSourcingContact[]>(demoEventContacts);
  const [drafts, setDrafts] = useState<EventOutreachDraft[]>(demoOutreachDrafts);
  const [feedback, setFeedback] = useState<EventCandidateFeedback[]>(demoEventFeedback);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [error, setError] = useState<string | null>(null);
  const [usingDemoData, setUsingDemoData] = useState(!hasSupabaseConfig);

  const load = async () => {
    if (!hasSupabaseConfig) {
      setUsingDemoData(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [candidateResponse, contactResponse, draftResponse, feedbackResponse] = await Promise.all([
      supabase.from('event_sourcing_candidates').select('*').order('score', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('event_sourcing_contacts').select('*').order('created_at', { ascending: false }),
      supabase.from('event_outreach_drafts').select('*').order('updated_at', { ascending: false }),
      supabase.from('event_candidate_feedback').select('*').order('created_at', { ascending: false })
    ]);

    const responses = [candidateResponse, contactResponse, draftResponse, feedbackResponse];
    const firstError = responses.find((response) => response.error)?.error;

    if (firstError) {
      setUsingDemoData(true);
      setError(firstError.message);
      setCandidates(demoEventCandidates);
      setContacts(demoEventContacts);
      setDrafts(demoOutreachDrafts);
      setFeedback(demoEventFeedback);
      setLoading(false);
      return;
    }

    setUsingDemoData(false);
    setCandidates(((candidateResponse.data ?? []) as EventSourcingCandidateRow[]).map(mapEventSourcingCandidateRow));
    setContacts(((contactResponse.data ?? []) as EventSourcingContactRow[]).map(mapEventSourcingContactRow));
    setDrafts(((draftResponse.data ?? []) as EventOutreachDraftRow[]).map(mapEventOutreachDraftRow));
    setFeedback(((feedbackResponse.data ?? []) as EventCandidateFeedbackRow[]).map(mapEventCandidateFeedbackRow));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return {
    candidates,
    contacts,
    drafts,
    feedback,
    loading,
    error,
    usingDemoData,
    reload: load
  };
};
