create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  trade_fingerprint text unique,
  account text not null,
  instrument text not null,
  side text not null,
  quantity numeric not null,
  entry_time timestamptz not null,
  exit_time timestamptz not null,
  entry_price numeric not null,
  exit_price numeric not null,
  gross_pnl numeric not null,
  commission numeric not null,
  net_pnl numeric not null,
  trade_tags text[] not null default '{}',
  trade_note text,
  close_early_outcome text check (close_early_outcome in ('winner', 'loser')),
  close_early_ticks numeric,
  source_file text,
  created_at timestamptz default now()
);

create unique index if not exists trades_trade_fingerprint_idx on trades (trade_fingerprint);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  request_date date not null,
  approved_date date,
  received_date date,
  amount numeric not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

create table if not exists balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  snapshot_date date not null,
  balance numeric not null,
  realized_pnl numeric,
  snapshot_type text default 'eod',
  notes text,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  goal_title text not null,
  target_amount numeric,
  total_ticks integer not null,
  ticks_remaining integer not null,
  contracts integer not null default 1,
  tick_step integer not null default 1,
  initial_balance numeric,
  min_balance_after_payout numeric,
  min_request_amount numeric,
  max_payout_amount numeric,
  min_trading_days integer,
  min_profitable_days integer,
  profitable_day_threshold numeric,
  consistency_limit_pct numeric,
  tick_value_per_contract numeric,
  linked_accounts_count integer,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  case_name text not null,
  defendant text not null,
  claim_form_url text not null,
  source_url text not null,
  notice_excerpt text,
  filing_deadline date not null,
  purchase_start date,
  purchase_end date,
  proof_required boolean not null default false,
  cash_payment text,
  status text not null default 'monitoring',
  class_definition text not null,
  attestation_required boolean not null default true,
  jurisdictions text[] not null default '{}',
  excluded_groups text[] not null default '{}',
  created_at timestamptz default now()
);

create table if not exists claimant_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  states_of_residence text[] not null default '{}',
  merchants text[] not null default '{}',
  brands_used text[] not null default '{}',
  notes text,
  consent_on_file boolean not null default false,
  consent_scope text not null default 'notification_only',
  created_at timestamptz default now()
);

create table if not exists settlement_matches (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  claimant_id uuid not null references claimant_profiles(id) on delete cascade,
  match_score integer not null,
  match_basis text[] not null default '{}',
  purchase_evidence_status text not null default 'missing',
  consent_status text not null default 'missing',
  review_status text not null default 'queued',
  risk_flags text[] not null default '{}',
  eligibility_notes text,
  created_at timestamptz default now()
);

create unique index if not exists settlement_matches_unique_pair_idx
  on settlement_matches (settlement_id, claimant_id);

create table if not exists claim_submissions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  claimant_id uuid not null references claimant_profiles(id) on delete cascade,
  match_id uuid references settlement_matches(id) on delete set null,
  submission_status text not null default 'draft',
  submitted_at timestamptz,
  confirmation_number text,
  filing_notes text,
  created_at timestamptz default now()
);

create table if not exists claim_notice_ingestions (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null,
  fetch_status text not null default 'fetched',
  http_status integer,
  content_type text,
  raw_content text,
  extracted_case_name text,
  extracted_deadline date,
  proof_required boolean,
  created_at timestamptz default now()
);

create table if not exists claim_notice_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null unique,
  is_active boolean not null default true,
  fetch_frequency_label text,
  last_checked_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz default now()
);

create table if not exists claim_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  seed_name text not null,
  seed_url text not null,
  candidate_title text not null,
  candidate_url text not null unique,
  discovery_status text not null default 'discovered',
  score integer not null default 0,
  estimated_payout text,
  tags text[] not null default '{}',
  notes text,
  is_likely_no_proof boolean not null default false,
  has_claim_form boolean not null default false,
  has_deadline boolean not null default false,
  is_duplicate boolean not null default false,
  reviewed_at timestamptz,
  promoted_source_id uuid references claim_notice_sources(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists event_sourcing_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  event_name text not null,
  event_url text not null unique,
  more_info_url text,
  source_name text not null,
  source_url text not null,
  intake_source text not null default 'discovery',
  city text,
  country text,
  event_start_date date,
  event_end_date date,
  audience_size_text text,
  industry_tags text[] not null default '{}',
  score integer not null default 0,
  workflow_stage text not null default 'event_candidates',
  hb_status text not null default 'pending_review',
  crm_status text not null default 'not_added',
  why_fit text,
  ai_summary text,
  planner_name text,
  planner_role text,
  planner_company text,
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists event_sourcing_contacts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references event_sourcing_candidates(id) on delete cascade,
  contact_name text not null,
  contact_role text,
  contact_email text,
  contact_phone text,
  linkedin_url text,
  contact_source_url text,
  verification_status text not null default 'unverified',
  notes text,
  created_at timestamptz default now()
);

create table if not exists event_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references event_sourcing_candidates(id) on delete cascade,
  contact_id uuid references event_sourcing_contacts(id) on delete set null,
  channel text not null default 'email',
  subject_line text not null,
  message_body text not null,
  personalization_points text[] not null default '{}',
  approval_status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists event_candidate_feedback (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references event_sourcing_candidates(id) on delete set null,
  source_name text,
  source_domain text,
  event_name text,
  event_url text,
  organization_name text,
  feedback_label text not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists account_metric_overrides (
  id uuid primary key default gen_random_uuid(),
  account text not null unique,
  trading_days_adjustment integer not null default 0,
  profitable_days_adjustment integer not null default 0,
  largest_single_day_override numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
