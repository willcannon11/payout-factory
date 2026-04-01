# Payout Factory (Trade Tracker)

Hosted MVP for NinjaTrader CSV imports, rolling average daily profit, and payout velocity.
This repo now also includes a claims-operations scaffold for tracking class action settlement intake, claimant matching, and consent-gated filing preparation.

## What’s included
- Dashboard with rolling average daily profit (7/30/60/90), win rate, profit factor, expectancy
- Dashboard equity curve and daily P&L charts with 30/60/90-day filters
- Monthly calendar with weekly totals
- Reports page with symbol, side, tag, and date filtering
- Trade journal page for tags and notes
- Payout tracking (request vs paid dates)
- Balance snapshots with optional screenshot upload
- CSV import from NinjaTrader exports
- Claims Ops dashboard for settlement intake, match review, and submission queue visibility
- URL-based notice fetch and extraction flow for building a settlement intake queue
- Source queue management for recurring notice URLs and batch ingestion
- Curated discovery crawl that finds likely settlement links from seed feeds
- Discovery review queue with candidate scoring, tags, and approve/reject flow
- Estimated payout surfaced in discovery review when the candidate page exposes it
- `More info` links and `AI Summarize` support on discovery review cards

## Setup (local dev)
1. Create a Supabase project.
2. Run the SQL in `supabase/schema.sql`.
3. Create a storage bucket named `balances` (public access) for screenshots.
4. Create a `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
# optional
OPENAI_OCR_MODEL=gpt-4.1-mini
OPENAI_CHAT_MODEL=gpt-4.1-mini
```

5. Install and run:

```bash
npm install
npm run dev
```

## Deployment (hosted)
- Deploy the app to Vercel.
- Add the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel environment variables.
- Add `OPENAI_API_KEY` so screenshot balance imports use hosted OCR instead of local `tesseract`.
- Optionally add `OPENAI_OCR_MODEL` if you want to override the default hosted OCR model (`gpt-4.1-mini`).
- Optionally add `OPENAI_CHAT_MODEL` if you want a different model for AI Apprentice chat responses.

## Notes
- Point values used to compute P&L: ES=50, MES=5, NQ=20, MNQ=2, YM=5, MYM=0.5, RTY=50, M2K=5, CL=1000, MCL=100, GC=100, MGC=10.
- Unmapped instruments default to point value 1.
- Avg daily profit is calculated over calendar days in the rolling window.
- The screenshot importer uses OpenAI hosted vision OCR whenever `OPENAI_API_KEY` is present. If no API key is set, local development falls back to the machine's `tesseract` binary.

## Updating an existing Supabase schema
If you already ran the original schema before tags/notes were added, run this in Supabase SQL Editor:

```sql
alter table trades add column if not exists trade_tags text[] not null default '{}';
alter table trades add column if not exists trade_note text;
alter table trades add column if not exists close_early_outcome text;
alter table trades add column if not exists close_early_ticks numeric;
alter table trades drop constraint if exists trades_close_early_outcome_check;
alter table trades
  add constraint trades_close_early_outcome_check
  check (close_early_outcome in ('winner', 'loser'));
```

If you already created the `payouts` table before approval and received dates were added, run:

```sql
alter table payouts add column if not exists approved_date date;
alter table payouts add column if not exists received_date date;
```

If you want to use the Goals tab, create the goals table too:

```sql
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
```

If you already created the `goals` table before account-level payout settings were added, run:

```sql
alter table goals add column if not exists initial_balance numeric;
alter table goals add column if not exists min_balance_after_payout numeric;
alter table goals add column if not exists min_request_amount numeric;
alter table goals add column if not exists max_payout_amount numeric;
alter table goals add column if not exists min_trading_days integer;
alter table goals add column if not exists min_profitable_days integer;
alter table goals add column if not exists profitable_day_threshold numeric;
alter table goals add column if not exists consistency_limit_pct numeric;
alter table goals add column if not exists tick_value_per_contract numeric;
alter table goals add column if not exists linked_accounts_count integer;
```

## Claims Ops schema
To switch the `/claims` page from seeded demo records to live Supabase data, run the `settlements`, `claimant_profiles`, `settlement_matches`, and `claim_submissions` table definitions from [supabase/schema.sql](/Users/williamcannon/Documents/New project/trade-tracker-app/supabase/schema.sql).

The current implementation is intentionally consent-gated:
- `settlements` stores normalized notice terms and whether proof is required.
- `claimant_profiles` stores consent scope and claimant facts used for matching.
- `settlement_matches` stores the machine/manual review result and risk flags.
- `claim_submissions` stores draft, attestation, and submission state.
- `claim_notice_ingestions` stores raw fetched notice content and extraction metadata for auditability.
- `claim_notice_sources` stores the tracked URL queue, run history, and last fetch status.
- `claim_discovery_candidates` stores scored discovery results before they are promoted into the source queue.

The manual intake forms on `/claims` post through server routes, so live writes work best when `SUPABASE_SERVICE_ROLE_KEY` is set on the server.
The URL fetch flow uses the `/api/claims/ingest-url` route to download notice pages server-side and prefill the settlement draft.
The recurring queue uses `/api/claims/sources` to manage tracked URLs and `/api/claims/process-sources` to process all active sources in a batch.
The discovery crawl uses `/api/claims/discover` and the `discover:claim-sources` script to scan curated settlement feeds for candidate notice pages.
The discovery review stage uses `/api/claims/review-candidates` so you can approve or reject candidates after scoring.
The review cards can call `/api/claims/summarize-candidate` to generate a fuller operator summary from the candidate page.
If Supabase reports that `claim_discovery_candidates` is missing, rerun the latest [supabase/schema.sql](/Users/williamcannon/Documents/New project/trade-tracker-app/supabase/schema.sql) so the review workflow tables exist.
