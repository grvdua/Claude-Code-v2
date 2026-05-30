import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ReorderPredictionBundle,
  ReorderPredictionItem,
  ReorderPredictionResult,
  ReorderPriceTrend,
  ReorderUrgency,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL_NAME = 'recommend_reorders';

const URGENCIES: readonly ReorderUrgency[] = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

const PRICE_TRENDS: readonly ReorderPriceTrend[] = [
  'rising',
  'stable',
  'falling',
] as const;

const SYSTEM_PROMPT = `You are a procurement planner for an Indian restaurant. You receive the current stock position for items at or near their reorder threshold, the recent stock-adjustment history (negative deltas = consumption, positive = receipts), the vendor invoice ledger for these items, and recent price history per item. You produce a structured reorder recommendation.

Factors to weigh:
1. Consumption velocity — average daily consumption derived from negative stockAdjustments over the most recent observable window (prefer the last 14-30 days; fall back to whatever data exists). Items with no consumption history but at/below reorder still need a precautionary recommendation.
2. Days-of-supply at current rate — currentQuantity / avgDailyConsumption. Items with <=2 days are critical, <=5 days are high, <=10 days are medium, >10 days are low.
3. Price trend — compare the most recent unitPrice to the trailing average. Rising (>5% above trailing avg) → consider stocking up sooner / larger; falling (>5% below) → buy lean; otherwise stable. Set priceTrend accordingly.
4. Vendor lead time defaults — assume 3-7 days for Indian vendors unless data suggests otherwise. Bias recommendedQuantity to cover 2-3 weeks of supply for non-perishables; 3-7 days for perishables (vegetables, dairy, meat, fish).
5. Avoid overstocking perishables. For dry goods (rice, oil, pulses, spices, packaging), a longer cover window is fine.

For every input item, return exactly one recommendation. Fields:
- itemId: must match the input id.
- recommendedQuantity: in the item's own unit. Positive number.
- urgency: one of critical/high/medium/low (see thresholds above).
- estimatedDaysUntilStockout: integer >= 0. Use a large finite number (e.g. 999) when consumption is unknown.
- projectedSpendINR: recommendedQuantity * best estimate of next unit price (use most recent unitPrice if available, else 0).
- reasoning: 2-3 short sentences citing consumption rate, days-of-supply, and price signal.
- priceTrend: one of rising/stable/falling.

summary: 2-3 sentence overview — total items needing attention, count of critical/high, any price signals worth flagging.

ALWAYS call the ${TOOL_NAME} tool with the structured output.`;

function jsonFail(error: string) {
  return NextResponse.json({ ok: false, error });
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function coerceUrgency(value: unknown): ReorderUrgency {
  if (
    typeof value === 'string' &&
    (URGENCIES as readonly string[]).includes(value)
  ) {
    return value as ReorderUrgency;
  }
  return 'medium';
}

function coercePriceTrend(value: unknown): ReorderPriceTrend {
  if (
    typeof value === 'string' &&
    (PRICE_TRENDS as readonly string[]).includes(value)
  ) {
    return value as ReorderPriceTrend;
  }
  return 'stable';
}

function coerceItems(
  value: unknown,
  knownIds: Set<string>
): ReorderPredictionItem[] {
  if (!Array.isArray(value)) return [];
  const out: ReorderPredictionItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const itemId = coerceString(obj.itemId);
    if (!knownIds.has(itemId)) continue;
    out.push({
      itemId,
      recommendedQuantity: Math.max(0, coerceNumber(obj.recommendedQuantity)),
      urgency: coerceUrgency(obj.urgency),
      estimatedDaysUntilStockout: Math.max(
        0,
        Math.round(coerceNumber(obj.estimatedDaysUntilStockout))
      ),
      projectedSpendINR: Math.max(0, coerceNumber(obj.projectedSpendINR)),
      reasoning: coerceString(obj.reasoning),
      priceTrend: coercePriceTrend(obj.priceTrend),
    });
  }
  return out;
}

function normalizeOutput(
  raw: unknown,
  knownIds: Set<string>
): ReorderPredictionResult {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    items: coerceItems(obj.items, knownIds),
    summary: coerceString(obj.summary),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'AI reorder predictions not configured',
    });
  }

  let body: ReorderPredictionBundle;
  try {
    body = (await req.json()) as ReorderPredictionBundle;
  } catch {
    return jsonFail('Invalid JSON body');
  }

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return jsonFail(
      'No items qualify for reorder analysis — all stock is comfortably above reorder level.'
    );
  }

  const knownIds = new Set(body.items.map((i) => i.id));

  const tool: Anthropic.Tool = {
    name: TOOL_NAME,
    description:
      'Record per-item reorder recommendations for an Indian restaurant based on stock, consumption history, vendor ledger and price trends.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description:
            'One recommendation per input item. itemId must match the input id.',
          items: {
            type: 'object',
            properties: {
              itemId: {
                type: 'string',
                description:
                  'Must match an id from the input items array exactly.',
              },
              recommendedQuantity: {
                type: 'number',
                description:
                  "Quantity to reorder in the item's own unit. Positive number.",
              },
              urgency: {
                type: 'string',
                enum: [...URGENCIES],
                description:
                  'critical (<=2 days supply), high (<=5), medium (<=10), low (>10).',
              },
              estimatedDaysUntilStockout: {
                type: 'number',
                description:
                  'Integer days of supply at current consumption rate. Use 999 when consumption is unknown.',
              },
              projectedSpendINR: {
                type: 'number',
                description:
                  'recommendedQuantity * best estimate of next unit price (latest unitPrice if known, else 0).',
              },
              reasoning: {
                type: 'string',
                description:
                  '2-3 short sentences citing consumption rate, days-of-supply, and price signal.',
              },
              priceTrend: {
                type: 'string',
                enum: [...PRICE_TRENDS],
                description:
                  "rising (>5% above trailing avg), stable, falling (>5% below).",
              },
            },
            required: [
              'itemId',
              'recommendedQuantity',
              'urgency',
              'estimatedDaysUntilStockout',
              'projectedSpendINR',
              'reasoning',
              'priceTrend',
            ],
          },
        },
        summary: {
          type: 'string',
          description:
            '2-3 sentence overview — total items, count of critical/high, key price signals.',
        },
      },
      required: ['items', 'summary'],
    },
  };

  const userText = [
    `Items needing analysis (${body.items.length}):`,
    ...body.items.map(
      (it) =>
        `- id=${it.id} name="${it.name}" category="${it.category}" location=${it.location} qty=${it.currentQuantity} ${it.unit} reorderLevel=${it.reorderLevel} unitPrice=${it.unitPrice ?? 'unknown'}`
    ),
    '',
    `Stock adjustments (${body.stockHistory.length}, negative=consumption):`,
    ...body.stockHistory
      .slice(0, 200)
      .map(
        (a) =>
          `- itemId=${a.itemId} delta=${a.delta} at=${a.adjustedAt} source=${a.source ?? 'manual'}`
      ),
    '',
    `Vendor ledger (${body.vendorLedger.length}):`,
    ...body.vendorLedger
      .slice(0, 100)
      .map(
        (v) =>
          `- ${v.date} ${v.itemName}: ${v.quantity} ${v.unit} @ INR ${v.unitPrice}`
      ),
    '',
    `Price history (${body.priceHistory.length}):`,
    ...body.priceHistory
      .slice(0, 100)
      .map((p) => `- ${p.date} ${p.itemName}: INR ${p.unitPrice}`),
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
    console.error('[predict-reorders] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'Reorder prediction failed';
    return jsonFail(message);
  }
}
