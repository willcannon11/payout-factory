import {
  ClaimDiscoveryCandidate,
  ClaimDiscoveryCandidateRow,
  ClaimSubmission,
  ClaimSubmissionRow,
  ClaimNoticeSource,
  ClaimNoticeSourceRow,
  ClaimantProfile,
  ClaimantProfileRow,
  Settlement,
  SettlementMatch,
  SettlementMatchRow,
  SettlementRow
} from './types';

export const mapSettlementRow = (row: SettlementRow): Settlement => ({
  id: row.id,
  sourceName: row.source_name,
  caseName: row.case_name,
  defendant: row.defendant,
  claimFormUrl: row.claim_form_url,
  sourceUrl: row.source_url,
  noticeExcerpt: row.notice_excerpt,
  filingDeadline: row.filing_deadline,
  purchaseStart: row.purchase_start,
  purchaseEnd: row.purchase_end,
  proofRequired: row.proof_required,
  cashPayment: row.cash_payment,
  status: row.status,
  classDefinition: row.class_definition,
  attestationRequired: row.attestation_required,
  jurisdictions: row.jurisdictions ?? [],
  excludedGroups: row.excluded_groups ?? []
});

export const mapClaimantProfileRow = (row: ClaimantProfileRow): ClaimantProfile => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  statesOfResidence: row.states_of_residence ?? [],
  merchants: row.merchants ?? [],
  brandsUsed: row.brands_used ?? [],
  notes: row.notes,
  consentOnFile: row.consent_on_file,
  consentScope: row.consent_scope
});

export const mapSettlementMatchRow = (row: SettlementMatchRow): SettlementMatch => ({
  id: row.id,
  settlementId: row.settlement_id,
  claimantId: row.claimant_id,
  matchScore: row.match_score,
  matchBasis: row.match_basis ?? [],
  purchaseEvidenceStatus: row.purchase_evidence_status,
  consentStatus: row.consent_status,
  reviewStatus: row.review_status,
  riskFlags: row.risk_flags ?? [],
  eligibilityNotes: row.eligibility_notes
});

export const mapClaimSubmissionRow = (row: ClaimSubmissionRow): ClaimSubmission => ({
  id: row.id,
  settlementId: row.settlement_id,
  claimantId: row.claimant_id,
  matchId: row.match_id,
  submissionStatus: row.submission_status,
  submittedAt: row.submitted_at,
  confirmationNumber: row.confirmation_number,
  filingNotes: row.filing_notes
});

export const mapClaimNoticeSourceRow = (row: ClaimNoticeSourceRow): ClaimNoticeSource => ({
  id: row.id,
  sourceName: row.source_name,
  sourceUrl: row.source_url,
  isActive: row.is_active,
  fetchFrequencyLabel: row.fetch_frequency_label,
  lastCheckedAt: row.last_checked_at,
  lastHttpStatus: row.last_http_status,
  lastError: row.last_error
});

export const mapClaimDiscoveryCandidateRow = (row: ClaimDiscoveryCandidateRow): ClaimDiscoveryCandidate => ({
  id: row.id,
  seedName: row.seed_name,
  seedUrl: row.seed_url,
  candidateTitle: row.candidate_title,
  candidateUrl: row.candidate_url,
  discoveryStatus: row.discovery_status,
  score: row.score,
  estimatedPayout: row.estimated_payout,
  tags: row.tags ?? [],
  notes: row.notes,
  isLikelyNoProof: row.is_likely_no_proof,
  hasClaimForm: row.has_claim_form,
  hasDeadline: row.has_deadline,
  isDuplicate: row.is_duplicate,
  reviewedAt: row.reviewed_at,
  promotedSourceId: row.promoted_source_id
});

export const demoSettlements: Settlement[] = [
  {
    id: 'set-1',
    sourceName: 'Settlement Administrator',
    caseName: 'Everyday Pantry Products Settlement',
    defendant: 'Northstar Consumer Brands',
    claimFormUrl: 'https://example.com/claims/everyday-pantry',
    sourceUrl: 'https://example.com/notices/everyday-pantry',
    noticeExcerpt: 'Consumers who purchased listed pantry products between January 2020 and June 2024 may submit a claim without proof for up to three units.',
    filingDeadline: '2026-04-22',
    purchaseStart: '2020-01-01',
    purchaseEnd: '2024-06-30',
    proofRequired: false,
    cashPayment: 'Up to $18 without proof, higher with receipts',
    status: 'collecting_consents',
    classDefinition: 'US residents who purchased qualifying pantry products for household use.',
    attestationRequired: true,
    jurisdictions: ['US'],
    excludedGroups: ['Employees', 'Judicial officers']
  },
  {
    id: 'set-2',
    sourceName: 'Court Notice Feed',
    caseName: 'FreshWave Detergent Marketing Settlement',
    defendant: 'FreshWave Home LLC',
    claimFormUrl: 'https://example.com/claims/freshwave',
    sourceUrl: 'https://example.com/notices/freshwave',
    noticeExcerpt: 'No proof is required for one household claim if the purchaser bought eligible detergent products in California or Illinois.',
    filingDeadline: '2026-05-10',
    purchaseStart: '2021-03-01',
    purchaseEnd: '2025-01-15',
    proofRequired: false,
    cashPayment: 'Estimated $12 to $25',
    status: 'ready_for_review',
    classDefinition: 'California and Illinois consumers who bought labeled detergent products during the class period.',
    attestationRequired: true,
    jurisdictions: ['CA', 'IL'],
    excludedGroups: ['Defendant affiliates']
  },
  {
    id: 'set-3',
    sourceName: 'Legal Notice Monitor',
    caseName: 'WellLife Vitamins Settlement',
    defendant: 'WellLife Nutrition Inc.',
    claimFormUrl: 'https://example.com/claims/welllife',
    sourceUrl: 'https://example.com/notices/welllife',
    noticeExcerpt: 'Claims may be filed for qualifying vitamin purchases, but proof of purchase is required for each claimed unit.',
    filingDeadline: '2026-06-14',
    purchaseStart: '2022-01-01',
    purchaseEnd: '2025-08-31',
    proofRequired: true,
    cashPayment: 'Varies by documented purchases',
    status: 'monitoring',
    classDefinition: 'Consumers in the United States who purchased eligible supplements.',
    attestationRequired: true,
    jurisdictions: ['US'],
    excludedGroups: []
  }
];

export const demoClaimants: ClaimantProfile[] = [
  {
    id: 'clm-1',
    fullName: 'Jordan Hale',
    email: 'jordan@example.com',
    statesOfResidence: ['TX', 'IL'],
    merchants: ['Target', 'Walmart', 'Amazon'],
    brandsUsed: ['FreshWave', 'Northstar Pantry'],
    notes: 'Opted into notification + submission with confirmation.',
    consentOnFile: true,
    consentScope: 'submit_with_confirmation'
  },
  {
    id: 'clm-2',
    fullName: 'Casey Nguyen',
    email: 'casey@example.com',
    statesOfResidence: ['CA'],
    merchants: ['Costco', 'Target'],
    brandsUsed: ['FreshWave'],
    notes: 'Needs fresh confirmation before filing any new claim.',
    consentOnFile: false,
    consentScope: 'prepare_only'
  },
  {
    id: 'clm-3',
    fullName: 'Taylor Brooks',
    email: 'taylor@example.com',
    statesOfResidence: ['OH'],
    merchants: ['Kroger'],
    brandsUsed: ['WellLife Vitamins'],
    notes: 'Receipt history not uploaded yet.',
    consentOnFile: true,
    consentScope: 'notification_only'
  }
];

export const demoMatches: SettlementMatch[] = [
  {
    id: 'match-1',
    settlementId: 'set-1',
    claimantId: 'clm-1',
    matchScore: 92,
    matchBasis: ['Brand match', 'Merchant overlap', 'Class period overlap'],
    purchaseEvidenceStatus: 'not_needed',
    consentStatus: 'granted',
    reviewStatus: 'ready',
    riskFlags: [],
    eligibilityNotes: 'Attestation still required before submission.'
  },
  {
    id: 'match-2',
    settlementId: 'set-2',
    claimantId: 'clm-2',
    matchScore: 88,
    matchBasis: ['State match', 'Brand match'],
    purchaseEvidenceStatus: 'self_attested',
    consentStatus: 'requested',
    reviewStatus: 'manual_review',
    riskFlags: ['No active consent on file'],
    eligibilityNotes: 'Needs an affirmative answer that claimant personally purchased the product.'
  },
  {
    id: 'match-3',
    settlementId: 'set-3',
    claimantId: 'clm-3',
    matchScore: 74,
    matchBasis: ['Brand match'],
    purchaseEvidenceStatus: 'missing',
    consentStatus: 'granted',
    reviewStatus: 'manual_review',
    riskFlags: ['Proof required', 'Receipt missing'],
    eligibilityNotes: 'Do not submit until receipts are uploaded.'
  }
];

export const demoSubmissions: ClaimSubmission[] = [
  {
    id: 'sub-1',
    settlementId: 'set-1',
    claimantId: 'clm-1',
    matchId: 'match-1',
    submissionStatus: 'awaiting_attestation',
    submittedAt: null,
    confirmationNumber: null,
    filingNotes: 'Payload prepared, waiting for claimant checkbox and final affirmation.'
  },
  {
    id: 'sub-2',
    settlementId: 'set-2',
    claimantId: 'clm-2',
    matchId: 'match-2',
    submissionStatus: 'draft',
    submittedAt: null,
    confirmationNumber: null,
    filingNotes: 'Consent reminder queued.'
  }
];

export const demoSources: ClaimNoticeSource[] = [
  {
    id: 'src-1',
    sourceName: 'Example Pantry Notice',
    sourceUrl: 'https://example.com/notices/everyday-pantry',
    isActive: true,
    fetchFrequencyLabel: 'Daily',
    lastCheckedAt: '2026-03-22T10:15:00Z',
    lastHttpStatus: 200,
    lastError: null
  },
  {
    id: 'src-2',
    sourceName: 'FreshWave Claims Feed',
    sourceUrl: 'https://example.com/notices/freshwave',
    isActive: true,
    fetchFrequencyLabel: 'Twice weekly',
    lastCheckedAt: '2026-03-21T16:40:00Z',
    lastHttpStatus: 200,
    lastError: null
  }
];

export const demoDiscoveryCandidates: ClaimDiscoveryCandidate[] = [
  {
    id: 'cand-1',
    seedName: 'ClassAction.org Settlements',
    seedUrl: 'https://www.classaction.org/settlements',
    candidateTitle: 'Sirius XM Radio - Unwanted Calls Class Action Settlement',
    candidateUrl: 'https://sxmtcpasettlement.com/home',
    discoveryStatus: 'discovered',
    score: 86,
    estimatedPayout: 'Up to $100 depending on valid claim tier',
    tags: ['claim_form_found', 'deadline_found', 'official_domain', 'likely_no_proof'],
    notes: 'Strong candidate: dedicated settlement domain with claim workflow language.',
    isLikelyNoProof: true,
    hasClaimForm: true,
    hasDeadline: true,
    isDuplicate: false,
    reviewedAt: null,
    promotedSourceId: null
  },
  {
    id: 'cand-2',
    seedName: 'ClassAction.org Settlements',
    seedUrl: 'https://www.classaction.org/settlements',
    candidateTitle: 'Domestic Flight Antitrust Class Action Settlement',
    candidateUrl: 'https://domesticairclass.com/',
    discoveryStatus: 'discovered',
    score: 71,
    estimatedPayout: 'Varies based on qualifying flight purchases',
    tags: ['claim_form_found', 'deadline_found'],
    notes: 'Looks viable, but proof policy is unclear and needs review.',
    isLikelyNoProof: false,
    hasClaimForm: true,
    hasDeadline: true,
    isDuplicate: false,
    reviewedAt: null,
    promotedSourceId: null
  }
];

export const formatShortDate = (value: string | null) => {
  if (!value) return 'Not filed';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
};

export const daysUntilDeadline = (value: string) => {
  const now = new Date();
  const deadline = new Date(`${value}T00:00:00`);
  return Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
};

export const settlementRiskLabel = (settlement: Settlement) => {
  if (settlement.proofRequired) return 'Proof needed';
  if (daysUntilDeadline(settlement.filingDeadline) <= 14) return 'Deadline soon';
  if (settlement.attestationRequired) return 'Attestation needed';
  return 'Ready to prep';
};

export const matchReadinessLabel = (match: SettlementMatch) => {
  if (match.reviewStatus === 'ready' && match.consentStatus === 'granted') return 'Ready for prep';
  if (match.consentStatus !== 'granted') return 'Needs consent';
  if (match.purchaseEvidenceStatus === 'missing') return 'Missing proof';
  return 'Manual review';
};

export const canPrepareClaim = (match: SettlementMatch, settlement: Settlement) =>
  match.reviewStatus === 'ready' &&
  match.consentStatus === 'granted' &&
  (!settlement.proofRequired || match.purchaseEvidenceStatus === 'uploaded');
