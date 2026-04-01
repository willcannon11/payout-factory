import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const buildTranscript = (messages: ChatMessage[]) =>
  messages.map((message) => `${message.role === 'assistant' ? 'AI Apprentice' : 'User'}: ${message.content}`).join('\n\n');

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

    const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini';
    const prompt = [
      'You are AI Apprentice inside a trading journal app.',
      'Answer only from the supplied page context and conversation transcript.',
      'Be specific, numeric, and practical.',
      'When recommending a target, compare the tested thresholds explicitly instead of just naming one.',
      'If the user asks about a number like $230 and the context only includes tested thresholds such as $200, $300, $500, say that clearly.',
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
