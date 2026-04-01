import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const buildTranscript = (messages: ChatMessage[]) =>
  messages.map((message) => `${message.role === 'assistant' ? 'AI Apprentice' : 'User'}: ${message.content}`).join('\n\n');

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const buildTargetRecommendation = (context: Record<string, any>, question: string) => {
  const backtest = context?.stopTargetBacktest;
  if (!backtest?.threshold) {
    return null;
  }

  const nearby = Array.isArray(backtest.nearby) ? backtest.nearby : [];
  const comparison = nearby
    .slice(0, 5)
    .map((item: Record<string, any>) =>
      `${formatCurrency(Number(item.threshold))}: avg realized ${formatCurrency(Number(item.avgRealized))}, lift ${formatCurrency(Number(item.avgDelta))}, reached ${Number(item.reachedDays)} days`
    )
    .join('; ');

  const lowerQuestion = question.toLowerCase();
  const asksForSpecific =
    lowerQuestion.includes('specific') ||
    lowerQuestion.includes('what should') ||
    lowerQuestion.includes('daily profit target') ||
    lowerQuestion.includes('stop target');

  if (!asksForSpecific) {
    return null;
  }

  return [
    `Based on your imported data, your best current daily profit target is ${formatCurrency(Number(backtest.threshold))} per account.`,
    `On the days where you actually hit that target, stopping there would have locked in an average realized finish of ${formatCurrency(Number(backtest.avgRealizedOnReachedDays))} per account, versus ${formatCurrency(Number(backtest.avgActualFinalOnReachedDays))} on those same days when you kept trading, for a lift of ${formatCurrency(Number(backtest.avgDeltaOnReachedDays))}.`,
    `Across all imported account-days, including days that never reached the target, the rule would have moved your average from ${formatCurrency(Number(backtest.avgActualFinal))} to ${formatCurrency(Number(backtest.avgRealized))} per account-day.`,
    `It was reached on ${Number(backtest.reachedDays)} of ${Number(backtest.totalAccountDays)} account-days (${Number(backtest.reachedPct).toFixed(1)}%).`,
    comparison ? `Closest tested comparisons: ${comparison}.` : '',
    'This recommendation comes from simulating “stop trading for the day the first time that profit target is reached,” not from the descriptive target table.'
  ]
    .filter(Boolean)
    .join(' ');
};

export async function POST(request: NextRequest) {
  try {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured for AI Apprentice chat yet.' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const question = String(body?.question ?? '').trim();
    const context = body?.context;
    const messages = Array.isArray(body?.messages)
      ? body.messages
          .map((message: ChatMessage) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: String(message.content ?? '').trim()
          }))
          .filter((message: ChatMessage) => message.content)
      : [];

    if (!question) {
      return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
    }

    const deterministicTargetAnswer = buildTargetRecommendation(context as Record<string, any>, question);
    if (deterministicTargetAnswer) {
      return NextResponse.json({ answer: deterministicTargetAnswer });
    }

    const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini';
    const prompt = [
      'You are AI Apprentice inside a trading journal app.',
      'Answer only from the supplied page context and conversation transcript.',
      'Be specific, numeric, and practical.',
      'Prefer the stopTargetBacktest section when the user asks what their daily target should be.',
      'The thresholdTable is descriptive. The stopTargetBacktest is prescriptive and should drive target recommendations.',
      'When recommending a target, compare the tested stop targets explicitly instead of just naming one.',
      'If the user asks about a number like $230 and the context only includes tested stop targets such as $425, $450, $475, say that clearly.',
      'When useful, quote the exact threshold row numbers from the context.',
      'If the context is insufficient for a claim, say so plainly instead of guessing.',
      '',
      `Current AI Apprentice page context:\n${JSON.stringify(context, null, 2)}`,
      '',
      `Conversation so far:\n${buildTranscript(messages)}`,
      '',
      `User's latest question:\n${question}`
    ].join('\n');

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'You are AI Apprentice inside a trading journal app. Be concise, evidence-based, and explicit about uncertainty.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error?.message || 'AI Apprentice request failed.' },
        { status: response.status }
      );
    }

    const answer =
      result.output_text ||
      result.output
        ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
        ?.map((item: { text?: string }) => item.text ?? '')
        ?.join('\n')
        ?.trim() ||
      '';

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI Apprentice request failed.' },
      { status: 500 }
    );
  }
}
