export type CsvRow = {
  instrument: string;
  action: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  time: Date;
  entryExit: 'Entry' | 'Exit';
  commission: number;
  account: string;
  name?: string;
  orderId?: string;
};

export type Trade = {
  id?: string;
  account: string;
  instrument: string;
  side: 'Long' | 'Short';
  quantity: number;
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  tags: string[];
  note?: string | null;
  sourceFile: string;
  fingerprintOrdinal?: number;
};

export type TradeRow = {
  id: string;
  trade_fingerprint?: string | null;
  account: string;
  instrument: string;
  side: 'Long' | 'Short';
  quantity: number;
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  gross_pnl: number;
  commission: number;
  net_pnl: number;
  trade_tags?: string[] | null;
  trade_note?: string | null;
  source_file: string;
};

export type DailyPnl = {
  date: string; // YYYY-MM-DD
  netPnl: number;
  trades: number;
};

export type PayoutRow = {
  id: string;
  account: string;
  request_date: string;
  approved_date: string | null;
  received_date: string | null;
  amount: number;
  status: 'pending' | 'paid' | 'denied';
};

export type BalanceSnapshotRow = {
  id: string;
  account: string;
  snapshot_date: string;
  balance: number;
  realized_pnl?: number | null;
  snapshot_type?: 'intraday' | 'eod' | null;
  notes: string | null;
  image_url: string | null;
  created_at?: string | null;
};

export type GoalRow = {
  id: string;
  goal_title: string;
  target_amount: number | null;
  total_ticks: number;
  ticks_remaining: number;
  contracts: number;
  tick_step: number;
  is_active: boolean;
  manual_paid_out_to_goal?: number | null;
  initial_balance?: number | null;
  min_balance_after_payout?: number | null;
  min_request_amount?: number | null;
  max_payout_amount?: number | null;
  min_trading_days?: number | null;
  min_profitable_days?: number | null;
  profitable_day_threshold?: number | null;
  consistency_limit_pct?: number | null;
  tick_value_per_contract?: number | null;
  linked_accounts_count?: number | null;
};

export type AccountMetricOverrideRow = {
  id: string;
  account: string;
  trading_days_adjustment: number;
  profitable_days_adjustment: number;
  largest_single_day_override: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SettlementRow = {
  id: string;
  source_name: string;
  case_name: string;
  defendant: string;
  claim_form_url: string;
  source_url: string;
  notice_excerpt: string | null;
  filing_deadline: string;
  purchase_start: string | null;
  purchase_end: string | null;
  proof_required: boolean;
  cash_payment: string | null;
  status: 'monitoring' | 'ready_for_review' | 'collecting_consents' | 'submitting' | 'closed';
  class_definition: string;
  attestation_required: boolean;
  jurisdictions: string[] | null;
  excluded_groups: string[] | null;
  created_at?: string;
};

export type ClaimantProfileRow = {
  id: string;
  full_name: string;
  email: string;
  states_of_residence: string[] | null;
  merchants: string[] | null;
  brands_used: string[] | null;
  notes: string | null;
  consent_on_file: boolean;
  consent_scope: 'notification_only' | 'prepare_only' | 'submit_with_confirmation';
  created_at?: string;
};

export type SettlementMatchRow = {
  id: string;
  settlement_id: string;
  claimant_id: string;
  match_score: number;
  match_basis: string[] | null;
  purchase_evidence_status: 'not_needed' | 'self_attested' | 'uploaded' | 'missing';
  consent_status: 'missing' | 'requested' | 'granted' | 'revoked';
  review_status: 'queued' | 'ready' | 'manual_review' | 'rejected';
  risk_flags: string[] | null;
  eligibility_notes: string | null;
  created_at?: string;
};

export type ClaimSubmissionRow = {
  id: string;
  settlement_id: string;
  claimant_id: string;
  match_id: string | null;
  submission_status: 'draft' | 'awaiting_attestation' | 'submitted' | 'follow_up_needed' | 'rejected';
  submitted_at: string | null;
  confirmation_number: string | null;
  filing_notes: string | null;
  created_at?: string;
};

export type ClaimNoticeSourceRow = {
  id: string;
  source_name: string;
  source_url: string;
  is_active: boolean;
  fetch_frequency_label: string | null;
  last_checked_at: string | null;
  last_http_status: number | null;
  last_error: string | null;
  created_at?: string;
};

export type ClaimDiscoveryCandidateRow = {
  id: string;
  seed_name: string;
  seed_url: string;
  candidate_title: string;
  candidate_url: string;
  discovery_status: 'discovered' | 'approved' | 'rejected' | 'promoted';
  score: number;
  estimated_payout: string | null;
  tags: string[] | null;
  notes: string | null;
  is_likely_no_proof: boolean;
  has_claim_form: boolean;
  has_deadline: boolean;
  is_duplicate: boolean;
  reviewed_at: string | null;
  promoted_source_id: string | null;
  created_at?: string;
};

export type Settlement = {
  id: string;
  sourceName: string;
  caseName: string;
  defendant: string;
  claimFormUrl: string;
  sourceUrl: string;
  noticeExcerpt: string | null;
  filingDeadline: string;
  purchaseStart: string | null;
  purchaseEnd: string | null;
  proofRequired: boolean;
  cashPayment: string | null;
  status: SettlementRow['status'];
  classDefinition: string;
  attestationRequired: boolean;
  jurisdictions: string[];
  excludedGroups: string[];
};

export type ClaimantProfile = {
  id: string;
  fullName: string;
  email: string;
  statesOfResidence: string[];
  merchants: string[];
  brandsUsed: string[];
  notes: string | null;
  consentOnFile: boolean;
  consentScope: ClaimantProfileRow['consent_scope'];
};

export type SettlementMatch = {
  id: string;
  settlementId: string;
  claimantId: string;
  matchScore: number;
  matchBasis: string[];
  purchaseEvidenceStatus: SettlementMatchRow['purchase_evidence_status'];
  consentStatus: SettlementMatchRow['consent_status'];
  reviewStatus: SettlementMatchRow['review_status'];
  riskFlags: string[];
  eligibilityNotes: string | null;
};

export type ClaimSubmission = {
  id: string;
  settlementId: string;
  claimantId: string;
  matchId: string | null;
  submissionStatus: ClaimSubmissionRow['submission_status'];
  submittedAt: string | null;
  confirmationNumber: string | null;
  filingNotes: string | null;
};

export type ClaimNoticeSource = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  isActive: boolean;
  fetchFrequencyLabel: string | null;
  lastCheckedAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
};

export type ClaimDiscoveryCandidate = {
  id: string;
  seedName: string;
  seedUrl: string;
  candidateTitle: string;
  candidateUrl: string;
  discoveryStatus: ClaimDiscoveryCandidateRow['discovery_status'];
  score: number;
  estimatedPayout: string | null;
  tags: string[];
  notes: string | null;
  isLikelyNoProof: boolean;
  hasClaimForm: boolean;
  hasDeadline: boolean;
  isDuplicate: boolean;
  reviewedAt: string | null;
  promotedSourceId: string | null;
};

export type EventSourcingCandidateRow = {
  id: string;
  organization_name: string;
  event_name: string;
  event_url: string;
  more_info_url: string | null;
  source_name: string;
  source_url: string;
  intake_source: 'discovery' | 'hb_unclaimed' | 'manual';
  city: string | null;
  country: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  audience_size_text: string | null;
  industry_tags: string[] | null;
  score: number;
  workflow_stage: 'event_candidates' | 'hb_review' | 'contact_research' | 'crm_outreach' | 'disqualified';
  hb_status: 'pending_review' | 'claimed_in_hb' | 'unclaimed_in_hb' | 'not_in_hb' | 'unknown';
  crm_status: 'not_added' | 'added_to_crm' | 'in_drip' | 'paused';
  why_fit: string | null;
  ai_summary: string | null;
  planner_name: string | null;
  planner_role: string | null;
  planner_company: string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at?: string;
};

export type EventSourcingContactRow = {
  id: string;
  candidate_id: string;
  contact_name: string;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  linkedin_url: string | null;
  contact_source_url: string | null;
  verification_status: 'unverified' | 'verified' | 'rejected';
  notes: string | null;
  created_at?: string;
};

export type EventOutreachDraftRow = {
  id: string;
  candidate_id: string;
  contact_id: string | null;
  channel: 'email' | 'linkedin';
  subject_line: string;
  message_body: string;
  personalization_points: string[] | null;
  approval_status: 'draft' | 'approved' | 'sent' | 'rejected';
  created_at?: string;
  updated_at?: string;
};

export type EventCandidateFeedbackRow = {
  id: string;
  candidate_id: string | null;
  source_name: string | null;
  source_domain: string | null;
  event_name: string | null;
  event_url: string | null;
  organization_name: string | null;
  feedback_label: 'good_fit' | 'competitor' | 'not_event_host' | 'low_value' | 'bad_data';
  notes: string | null;
  created_at?: string;
};

export type EventSourcingCandidate = {
  id: string;
  organizationName: string;
  eventName: string;
  eventUrl: string;
  moreInfoUrl: string | null;
  sourceName: string;
  sourceUrl: string;
  intakeSource: EventSourcingCandidateRow['intake_source'];
  city: string | null;
  country: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  audienceSizeText: string | null;
  industryTags: string[];
  score: number;
  workflowStage: EventSourcingCandidateRow['workflow_stage'];
  hbStatus: EventSourcingCandidateRow['hb_status'];
  crmStatus: EventSourcingCandidateRow['crm_status'];
  whyFit: string | null;
  aiSummary: string | null;
  plannerName: string | null;
  plannerRole: string | null;
  plannerCompany: string | null;
  notes: string | null;
  reviewedAt: string | null;
};

export type EventSourcingContact = {
  id: string;
  candidateId: string;
  contactName: string;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  linkedinUrl: string | null;
  contactSourceUrl: string | null;
  verificationStatus: EventSourcingContactRow['verification_status'];
  notes: string | null;
};

export type EventOutreachDraft = {
  id: string;
  candidateId: string;
  contactId: string | null;
  channel: EventOutreachDraftRow['channel'];
  subjectLine: string;
  messageBody: string;
  personalizationPoints: string[];
  approvalStatus: EventOutreachDraftRow['approval_status'];
};

export type EventCandidateFeedback = {
  id: string;
  candidateId: string | null;
  sourceName: string | null;
  sourceDomain: string | null;
  eventName: string | null;
  eventUrl: string | null;
  organizationName: string | null;
  feedbackLabel: EventCandidateFeedbackRow['feedback_label'];
  notes: string | null;
};

export type DateRangePreset = 7 | 30 | 60 | 90 | 180 | 365;

export type CalendarCell = {
  date: string;
  dayNumber: number;
  inMonth: boolean;
  netPnl: number;
  trades: number;
};

export type CalendarWeek = {
  label: string;
  totalPnl: number;
  totalTrades: number;
  days: CalendarCell[];
};
