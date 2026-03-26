'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  canPrepareClaim,
  demoClaimants,
  demoDiscoveryCandidates,
  demoMatches,
  demoSources,
  demoSettlements,
  demoSubmissions,
  mapClaimSubmissionRow,
  mapClaimDiscoveryCandidateRow,
  mapClaimNoticeSourceRow,
  mapClaimantProfileRow,
  mapSettlementMatchRow,
  mapSettlementRow
} from './claims';
import {
  ClaimSubmission,
  ClaimSubmissionRow,
  ClaimDiscoveryCandidate,
  ClaimDiscoveryCandidateRow,
  ClaimNoticeSource,
  ClaimNoticeSourceRow,
  ClaimantProfile,
  ClaimantProfileRow,
  Settlement,
  SettlementMatch,
  SettlementMatchRow,
  SettlementRow
} from './types';

const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const useClaimsData = () => {
  const [settlements, setSettlements] = useState<Settlement[]>(demoSettlements);
  const [claimants, setClaimants] = useState<ClaimantProfile[]>(demoClaimants);
  const [matches, setMatches] = useState<SettlementMatch[]>(demoMatches);
  const [submissions, setSubmissions] = useState<ClaimSubmission[]>(demoSubmissions);
  const [discoveryCandidates, setDiscoveryCandidates] = useState<ClaimDiscoveryCandidate[]>(demoDiscoveryCandidates);
  const [sources, setSources] = useState<ClaimNoticeSource[]>(demoSources);
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

    const [settlementResponse, claimantResponse, matchResponse, submissionResponse, sourceResponse, discoveryResponse] = await Promise.all([
      supabase.from('settlements').select('*').order('filing_deadline', { ascending: true }),
      supabase.from('claimant_profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('settlement_matches').select('*').order('match_score', { ascending: false }),
      supabase.from('claim_submissions').select('*').order('created_at', { ascending: false }),
      supabase.from('claim_notice_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('claim_discovery_candidates').select('*').order('score', { ascending: false }).order('created_at', { ascending: false })
    ]);

    const responses = [settlementResponse, claimantResponse, matchResponse, submissionResponse, sourceResponse, discoveryResponse];
    const firstError = responses.find((response) => response.error)?.error;

    if (firstError) {
      setUsingDemoData(true);
      setError(firstError.message);
      setSettlements(demoSettlements);
      setClaimants(demoClaimants);
      setMatches(demoMatches);
      setSubmissions(demoSubmissions);
      setSources(demoSources);
      setDiscoveryCandidates(demoDiscoveryCandidates);
      setLoading(false);
      return;
    }

    setUsingDemoData(false);
    setSettlements(((settlementResponse.data ?? []) as SettlementRow[]).map(mapSettlementRow));
    setClaimants(((claimantResponse.data ?? []) as ClaimantProfileRow[]).map(mapClaimantProfileRow));
    setMatches(((matchResponse.data ?? []) as SettlementMatchRow[]).map(mapSettlementMatchRow));
    setSubmissions(((submissionResponse.data ?? []) as ClaimSubmissionRow[]).map(mapClaimSubmissionRow));
    setSources(((sourceResponse.data ?? []) as ClaimNoticeSourceRow[]).map(mapClaimNoticeSourceRow));
    setDiscoveryCandidates(((discoveryResponse.data ?? []) as ClaimDiscoveryCandidateRow[]).map(mapClaimDiscoveryCandidateRow));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const readyMatches = matches.filter((match) => {
    const settlement = settlements.find((item) => item.id === match.settlementId);
    return settlement ? canPrepareClaim(match, settlement) : false;
  });

  return {
    settlements,
    claimants,
    matches,
    submissions,
    sources,
    discoveryCandidates,
    readyMatches,
    loading,
    error,
    usingDemoData,
    reload: load
  };
};
