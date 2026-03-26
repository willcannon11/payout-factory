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

export const mapEventSourcingCandidateRow = (row: EventSourcingCandidateRow): EventSourcingCandidate => ({
  id: row.id,
  organizationName: row.organization_name,
  eventName: row.event_name,
  eventUrl: row.event_url,
  moreInfoUrl: row.more_info_url,
  sourceName: row.source_name,
  sourceUrl: row.source_url,
  intakeSource: row.intake_source,
  city: row.city,
  country: row.country,
  eventStartDate: row.event_start_date,
  eventEndDate: row.event_end_date,
  audienceSizeText: row.audience_size_text,
  industryTags: row.industry_tags ?? [],
  score: row.score,
  workflowStage: row.workflow_stage,
  hbStatus: row.hb_status,
  crmStatus: row.crm_status,
  whyFit: row.why_fit,
  aiSummary: row.ai_summary,
  plannerName: row.planner_name,
  plannerRole: row.planner_role,
  plannerCompany: row.planner_company,
  notes: row.notes,
  reviewedAt: row.reviewed_at
});

export const mapEventSourcingContactRow = (row: EventSourcingContactRow): EventSourcingContact => ({
  id: row.id,
  candidateId: row.candidate_id,
  contactName: row.contact_name,
  contactRole: row.contact_role,
  contactEmail: row.contact_email,
  contactPhone: row.contact_phone,
  linkedinUrl: row.linkedin_url,
  contactSourceUrl: row.contact_source_url,
  verificationStatus: row.verification_status,
  notes: row.notes
});

export const mapEventOutreachDraftRow = (row: EventOutreachDraftRow): EventOutreachDraft => ({
  id: row.id,
  candidateId: row.candidate_id,
  contactId: row.contact_id,
  channel: row.channel,
  subjectLine: row.subject_line,
  messageBody: row.message_body,
  personalizationPoints: row.personalization_points ?? [],
  approvalStatus: row.approval_status
});

export const mapEventCandidateFeedbackRow = (row: EventCandidateFeedbackRow): EventCandidateFeedback => ({
  id: row.id,
  candidateId: row.candidate_id,
  sourceName: row.source_name,
  sourceDomain: row.source_domain,
  eventName: row.event_name,
  eventUrl: row.event_url,
  organizationName: row.organization_name,
  feedbackLabel: row.feedback_label,
  notes: row.notes
});

export const formatEventDateRange = (start: string | null, end: string | null) => {
  if (!start && !end) return 'Date TBD';
  if (start && end && start !== end) return `${start} to ${end}`;
  return start || end || 'Date TBD';
};

export const buildOutreachDraft = (candidate: EventSourcingCandidate, contact?: EventSourcingContact | null) => {
  const contactName = contact?.contactName || candidate.plannerName || 'there';
  const organization = candidate.organizationName;
  const location = [candidate.city, candidate.country].filter(Boolean).join(', ') || 'your host city';
  const eventName = candidate.eventName;
  const intro = `Hi ${contactName},`;
  const body = [
    `I’m reaching out because ${organization}'s ${eventName} looks like a strong fit for outsourced venue sourcing and hotel contract support.`,
    `My wife is an independent meeting planner with Helms Briscoe. She helps event teams compare venue options, manage site selection, and negotiate hotel terms, often improving rates and concessions without adding cost to the client.`,
    `She supports organizations ranging from media and education brands to mission-driven groups, and regularly helps US-based teams place meetings in markets like ${location}.`,
    `If venue sourcing or hotel negotiations are still in play for this event, would it be helpful to compare options or pressure-test the current proposal set?`
  ];
  const closing = 'Best,\n[Your Name]';

  return {
    subjectLine: `${organization} event sourcing support for ${eventName}`,
    messageBody: `${intro}\n\n${body.join('\n\n')}\n\n${closing}`,
    personalizationPoints: [
      `Organization: ${organization}`,
      `Event: ${eventName}`,
      `Location: ${location}`,
      candidate.whyFit || 'Likely fit based on meeting complexity and attendee profile.'
    ]
  };
};

export const demoEventCandidates: EventSourcingCandidate[] = [
  {
    id: 'evt-1',
    organizationName: 'BiggerPockets',
    eventName: 'BiggerPockets Conference 2026',
    eventUrl: 'https://example.com/biggerpockets-conference',
    moreInfoUrl: 'https://example.com/biggerpockets-conference/agenda',
    sourceName: 'Conference directory',
    sourceUrl: 'https://example.com/real-estate-events',
    intakeSource: 'discovery',
    city: 'Dallas',
    country: 'United States',
    eventStartDate: '2026-10-14',
    eventEndDate: '2026-10-16',
    audienceSizeText: '2,000+ investors and operators',
    industryTags: ['real-estate', 'conference', 'us-based'],
    score: 94,
    workflowStage: 'crm_outreach',
    hbStatus: 'unclaimed_in_hb',
    crmStatus: 'in_drip',
    whyFit: 'Large annual conference with sponsor blocks, room nights, and likely hotel leverage.',
    aiSummary: 'Dallas-based three-day real estate conference with a sizable attendee base, sponsors, and hotel room block complexity that likely benefits from structured sourcing and rate negotiation support.',
    plannerName: 'Morgan Lee',
    plannerRole: 'Events Director',
    plannerCompany: 'BiggerPockets',
    notes: 'Existing relationship account. Keep outreach consultative, not cold.',
    reviewedAt: '2026-03-22T15:30:00Z'
  },
  {
    id: 'evt-2',
    organizationName: 'National Association of Real Estate Investors',
    eventName: 'Investor Summit East',
    eventUrl: 'https://example.com/investor-summit-east',
    moreInfoUrl: 'https://example.com/investor-summit-east/details',
    sourceName: 'Association calendar',
    sourceUrl: 'https://example.com/association-events',
    intakeSource: 'discovery',
    city: 'Atlanta',
    country: 'United States',
    eventStartDate: '2026-09-08',
    eventEndDate: '2026-09-10',
    audienceSizeText: '800 attendees',
    industryTags: ['real-estate', 'association'],
    score: 86,
    workflowStage: 'hb_review',
    hbStatus: 'pending_review',
    crmStatus: 'not_added',
    whyFit: 'Association-led meeting with room block complexity and rotating host hotels.',
    aiSummary: 'Atlanta association summit expected to run for three days with mid-sized attendance and enough lodging/meeting complexity to justify venue sourcing support.',
    plannerName: null,
    plannerRole: null,
    plannerCompany: null,
    notes: 'Need planner contact verification before outreach.',
    reviewedAt: '2026-03-21T19:12:00Z'
  },
  {
    id: 'evt-3',
    organizationName: 'The Salvation Army',
    eventName: 'National Leadership Gathering',
    eventUrl: 'https://example.com/salvation-army-gathering',
    moreInfoUrl: 'https://example.com/salvation-army-gathering/travel',
    sourceName: 'Faith-based event listing',
    sourceUrl: 'https://example.com/nonprofit-meetings',
    intakeSource: 'hb_unclaimed',
    city: 'Phoenix',
    country: 'United States',
    eventStartDate: '2026-11-02',
    eventEndDate: '2026-11-05',
    audienceSizeText: 'National leadership teams',
    industryTags: ['nonprofit', 'faith-based', 'national-meeting'],
    score: 91,
    workflowStage: 'contact_research',
    hbStatus: 'unclaimed_in_hb',
    crmStatus: 'not_added',
    whyFit: 'Mission-driven national meeting with multiple stakeholder groups and high contract sensitivity.',
    aiSummary: 'Phoenix leadership gathering for a national nonprofit, likely spanning several days with multiple attendee cohorts and a need for careful contract review.',
    plannerName: null,
    plannerRole: null,
    plannerCompany: null,
    notes: 'Strong fit, but keep messaging relationship-first.',
    reviewedAt: '2026-03-20T12:00:00Z'
  },
  {
    id: 'evt-4',
    organizationName: 'Manual Prospect Example',
    eventName: 'Regional Operator Retreat',
    eventUrl: 'https://example.com/operator-retreat',
    moreInfoUrl: 'https://example.com/operator-retreat/schedule',
    sourceName: 'Manual entry',
    sourceUrl: 'manual://operator-retreat',
    intakeSource: 'manual',
    city: 'Scottsdale',
    country: 'United States',
    eventStartDate: '2026-08-03',
    eventEndDate: '2026-08-05',
    audienceSizeText: '250 attendees',
    industryTags: ['manual', 'retreat'],
    score: 78,
    workflowStage: 'contact_research',
    hbStatus: 'unknown',
    crmStatus: 'not_added',
    whyFit: 'Manually loaded prospect that should start directly at planner identification and contact research.',
    aiSummary: 'Three-day retreat in Scottsdale entered manually and intentionally started at Task 3 because the prospect source is already known.',
    plannerName: null,
    plannerRole: null,
    plannerCompany: null,
    notes: 'Example of a manual intake that skips Task 1 and Task 2.',
    reviewedAt: '2026-03-23T09:00:00Z'
  }
];

export const demoEventContacts: EventSourcingContact[] = [
  {
    id: 'ctc-1',
    candidateId: 'evt-1',
    contactName: 'Morgan Lee',
    contactRole: 'Events Director',
    contactEmail: 'morgan@example.com',
    contactPhone: null,
    linkedinUrl: 'https://linkedin.com/in/example-morgan',
    contactSourceUrl: 'https://example.com/team',
    verificationStatus: 'verified',
    notes: 'Existing client-side decision maker.'
  },
  {
    id: 'ctc-2',
    candidateId: 'evt-2',
    contactName: 'Jordan Patel',
    contactRole: 'Conference Manager',
    contactEmail: null,
    contactPhone: null,
    linkedinUrl: 'https://linkedin.com/in/example-jordan',
    contactSourceUrl: 'https://example.com/staff',
    verificationStatus: 'unverified',
    notes: 'Name surfaced on staff page, email still missing.'
  }
];

export const demoOutreachDrafts: EventOutreachDraft[] = [
  {
    id: 'drf-1',
    candidateId: 'evt-1',
    contactId: 'ctc-1',
    channel: 'email',
    subjectLine: 'BiggerPockets event sourcing support for BiggerPockets Conference 2026',
    messageBody:
      "Hi Morgan Lee,\n\nI’m reaching out because BiggerPockets Conference 2026 looks like a strong fit for outsourced venue sourcing and hotel contract support.\n\nMy wife is an independent meeting planner with Helms Briscoe. She helps event teams compare venue options, manage site selection, and negotiate hotel terms, often improving rates and concessions without adding cost to the client.\n\nIf venue sourcing or hotel negotiations are still in play for this event, would it be helpful to compare options or pressure-test the current proposal set?\n\nBest,\n[Your Name]",
    personalizationPoints: [
      'Existing relationship account',
      'Large annual conference with sponsor blocks',
      'Likely significant room block and venue leverage'
    ],
    approvalStatus: 'approved'
  }
];

export const demoEventFeedback: EventCandidateFeedback[] = [
  {
    id: 'fb-1',
    candidateId: null,
    sourceName: 'Association Management Solutions',
    sourceDomain: 'www.amsl.com',
    eventName: 'Event Planning',
    eventUrl: 'https://www.amsl.com/event-planning',
    organizationName: 'Association Management Solutions',
    feedbackLabel: 'competitor',
    notes: 'This is an AMC service page, not a hosted conference prospect.'
  }
];
