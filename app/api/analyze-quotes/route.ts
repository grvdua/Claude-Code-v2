import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { QuoteAnalysisResult, QuoteAIAnalysis } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL_NAME = 'record_quote_analysis';

interface QuotePayload {
  id: string;
  vendorName: string;
  vendorId: string;
  pricePerUnit: number;
  totalPrice: number;
  deliveryDate: string;
  notes: string;
}

interface AnalyzeQuotesBody {
  requestId: string;
  quotes: QuotePayload[];
  item: {
    name: string;
    unit: string;
    lastKnownPrice?: number;
  };
  vendorReliability: Record<string, number>;
}

const SYSTEM_PROMPT = `You are a procurement analyst for an Indian restaurant. You compare vendor quotes for a single raw material requirement and produce a structured recommendation.

Factors to weigh (roughly in this order):
1. Price competitiveness vs the other quotes and the lastKnownPrice (if provided). Suspiciously LOW prices (>25% under the pack) may indicate quality issues, expired stock, or a bait-and-switch — call that out in cons.
2. Vendor reliability score (0-100) for past on-time delivery, quote accuracy, fulfillment. A very low reliability vendor offering the cheapest price is usually NOT the right pick.
3. Delivery timeline — earlier is better for perishables, but only if reliability supports it.
4. Notes / terms — payment terms, MOQ, freebies, freight inclusion.

Pros/cons are short bullet phrases (5-10 words each). Reasoning is one paragraph (2-3 sentences) per quote. Summary is 2-3 sentences explaining the overall recommendation.

valueScore is 0-100: 100 = best price for the value offered. reliabilityScore should mirror the input vendorReliability for that vendor (passthrough). recommended=true for exactly ONE quote — the recommendedQuoteId.

estimatedSavingsINR: difference between the worst-priced quote and the recommended quote (savingsBaseline 'vs-worst'), OR vs the average if all quotes are close (within 10%). Pick whichever is meaningful. Use 0 if there's only one quote.

ALWAYS call the ${TOOL_NAME} tool with the structured output.`;

function jsonFail(error: string) {
  return NextResponse.json({ ok: false, error });
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  return out;
}

function coerceBaseline(value: unknown): 'vs-worst' | 'vs-avg' {
  return value === 'vs-avg' ? 'vs-avg' : 'vs-worst';
}

function coercePerQuote(
  value: unknown,
  knownIds: Set<string>
): Record<string, QuoteAIAnalysis> {
  const out: Record<string, QuoteAIAnalysis> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!knownIds.has(k)) continue;
    if (!v || typeof v !== 'object') continue;
    const obj = v as Record<string, unknown>;
    out[k] = {
      pros: coerceStringArray(obj.pros),
      cons: coerceStringArray(obj.cons),
      reliabilityScore: Math.max(0, Math.min(100, coerceNumber(obj.reliabilityScore))),
      valueScore: Math.max(0, Math.min(100, coerceNumber(obj.valueScore))),
      recommended: Boolean(obj.recommended),
      reasoning: coerceString(obj.reasoning),
    };
  }
  return out;
}

function normalizeOutput(
  raw: unknown,
  knownIds: Set<string>
): QuoteAnalysisResult {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const perQuote = coercePerQuote(obj.perQuote, knownIds);
  let recommended = coerceString(obj.recommendedQuoteId);
  if (!knownIds.has(recommended)) {
    // Fall back to whichever quote is marked recommended in perQuote, else first.
    const flagged = Object.entries(perQuote).find(([, v]) => v.recommended);
    recommended = flagged ? flagged[0] : Array.from(knownIds)[0] ?? '';
  }
  return {
    recommendedQuoteId: recommended,
    estimatedSavingsINR: Math.max(0, coerceNumber(obj.estimatedSavingsINR)),
    savingsBaseline: coerceBaseline(obj.savingsBaseline),
    perQuote,
    summary: coerceString(obj.summary),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonFail('AI extraction not configured');
  }

  let body: AnalyzeQuotesBody;
  try {
    body = (await req.json()) as AnalyzeQuotesBody;
  } catch {
    return jsonFail('Invalid JSON body');
  }

  if (!body || !Array.isArray(body.quotes) || body.quotes.length === 0) {
    return jsonFail('At least one quote is required');
  }
  if (!body.item || !body.item.name) {
    return jsonFail('Item details are required');
  }

  const knownIds = new Set(body.quotes.map((q) => q.id));

  const tool: Anthropic.Tool = {
    name: TOOL_NAME,
    description:
      'Record the AI comparison of vendor quotes for an Indian restaurant procurement request.',
    input_schema: {
      type: 'object',
      properties: {
        recommendedQuoteId: {
          type: 'string',
          description: 'The id of the quote you recommend the buyer raise a PO from.',
        },
        estimatedSavingsINR: {
          type: 'number',
          description:
            'INR saved by picking the recommended quote vs the baseline (worst or avg). Use 0 if only one quote.',
        },
        savingsBaseline: {
          type: 'string',
          enum: ['vs-worst', 'vs-avg'],
          description:
            "'vs-worst' when the spread is large; 'vs-avg' when all quotes are within ~10%.",
        },
        perQuote: {
          type: 'object',
          description:
            'Object keyed by quote id. Each value has pros, cons, reliabilityScore, valueScore, recommended, reasoning.',
          additionalProperties: {
            type: 'object',
            properties: {
              pros: {
                type: 'array',
                items: { type: 'string' },
                description: 'Short bullet phrases (5-10 words each).',
              },
              cons: {
                type: 'array',
                items: { type: 'string' },
                description: 'Short bullet phrases (5-10 words each).',
              },
              reliabilityScore: {
                type: 'number',
                description: '0-100. Pass through the input reliability score for the vendor.',
              },
              valueScore: {
                type: 'number',
                description: '0-100. Price competitiveness vs other quotes / lastKnownPrice.',
              },
              recommended: {
                type: 'boolean',
                description: 'True for exactly ONE quote — the recommended one.',
              },
              reasoning: {
                type: 'string',
                description: '2-3 sentence justification for this quote.',
              },
            },
            required: ['pros', 'cons', 'reliabilityScore', 'valueScore', 'recommended', 'reasoning'],
          },
        },
        summary: {
          type: 'string',
          description: '2-3 sentence overall recommendation summary.',
        },
      },
      required: ['recommendedQuoteId', 'estimatedSavingsINR', 'savingsBaseline', 'perQuote', 'summary'],
    },
  };

  const userText = [
    `Item: ${body.item.name} (unit: ${body.item.unit})`,
    body.item.lastKnownPrice
      ? `Last known unit price: INR ${body.item.lastKnownPrice}`
      : `Last known unit price: not available`,
    '',
    'Quotes:',
    ...body.quotes.map((q) => {
      const rel = body.vendorReliability[q.vendorId];
      return `- id=${q.id} vendor="${q.vendorName}" pricePerUnit=INR ${q.pricePerUnit} totalPrice=INR ${q.totalPrice} deliveryDate=${q.deliveryDate} reliability=${rel ?? 'n/a'} notes="${q.notes}"`;
    }),
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: userText }],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) {
      return jsonFail('Model did not return structured data');
    }

    const data = normalizeOutput(toolUse.input, knownIds);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[analyze-quotes] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'Quote analysis failed';
    return jsonFail(message);
  }
}
