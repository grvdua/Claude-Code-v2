import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  CostVarianceFlag,
  CostVarianceInsight,
  CostVarianceReport,
  InventoryItem,
  JournalEntry,
  PriceHistoryEntry,
  Recipe,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL_NAME = 'report_cost_variance';

const FLAGS: readonly CostVarianceFlag[] = ['ok', 'warning', 'critical'] as const;

interface RequestBody {
  recipes?: Recipe[];
  inventory?: InventoryItem[];
  journalEntries?: JournalEntry[];
  priceHistory?: PriceHistoryEntry[];
}

const SYSTEM_PROMPT = `You are a kitchen management consultant for an Indian restaurant. You analyze recipe costs by comparing the theoretical cost (sum of ingredient unit prices × recipe quantities, normalised to per portion) against the actual cost-per-portion implied by recent kitchen consumption.

For each recipe you receive:
- The recipe definition: name, yield (portions per batch), selling price, ingredient list with itemId, quantity per batch and unit.
- The latest unit price per ingredient (from inventory current price and the recent price-history feed).
- Recent journal entries: batch cooking events ("batch") proxy portions sold, "wastage" events suggest over-consumption, "prep" and "marination" indicate preparation activity.

Calculate:
1. theoreticalCostPerPortion = sum(ingredient.unitPrice × ingredient.quantity) / yieldPortions. Use 0 for unknown unit prices.
2. actualCostPerPortion: estimate from observed wastage, batch frequency, and price drift. If wastage entries reference one of the recipe's ingredients, inflate that ingredient's effective per-portion usage. If recent price history shows the unit price rising, use the rising figure for that ingredient. If data is thin, default actual = theoretical and surface that limitation in drivers.
3. variancePct = (actual - theoretical) / theoretical * 100. If theoretical is 0, use 0.
4. foodCostPct = (actual / sellingPricePerPortion) * 100. Restaurant target is usually 28-35%.
5. flag rules: |variancePct| < 5 → ok; 5–15 → warning; > 15 → critical. (Negative variance — actual lower than theoretical — is still ok / warning per the same thresholds.)
6. drivers: 1-4 very specific bullet phrases explaining the variance. Examples:
   - "Paneer over-portioning (actual 130g vs recipe 100g)"
   - "Oil wastage logged 4 times this week"
   - "Tomato unit price up 18% in last 30 days"
   - "No wastage logged — variance driven by ingredient price drift"
   When data is sparse, say so honestly: "Limited wastage signal — variance assumes recipe is followed."
7. recommendation: one actionable sentence — e.g. "Standardise paneer scoop to 100g; revisit selling price if costs persist."

overallSummary: 2-3 sentences calling out the worst offenders, average food-cost %, and any cross-cutting price pressure (e.g. "Dairy prices rising across recipes").

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

function coerceFlag(value: unknown): CostVarianceFlag {
  if (
    typeof value === 'string' &&
    (FLAGS as readonly string[]).includes(value)
  ) {
    return value as CostVarianceFlag;
  }
  return 'ok';
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function coerceInsights(
  value: unknown,
  validRecipeIds: Set<string>
): CostVarianceInsight[] {
  if (!Array.isArray(value)) return [];
  const out: CostVarianceInsight[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const recipeId = coerceString(obj.recipeId);
    if (!validRecipeIds.has(recipeId)) continue;
    out.push({
      recipeId,
      theoreticalCostPerPortion: Math.max(
        0,
        coerceNumber(obj.theoreticalCostPerPortion)
      ),
      actualCostPerPortion: Math.max(0, coerceNumber(obj.actualCostPerPortion)),
      variancePct: coerceNumber(obj.variancePct),
      foodCostPct: Math.max(0, coerceNumber(obj.foodCostPct)),
      flag: coerceFlag(obj.flag),
      drivers: coerceStringArray(obj.drivers),
      recommendation: coerceString(obj.recommendation),
    });
  }
  return out;
}

function normalizeOutput(
  raw: unknown,
  validRecipeIds: Set<string>
): CostVarianceReport {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    generatedAt: new Date().toISOString(),
    perRecipe: coerceInsights(obj.perRecipe, validRecipeIds),
    overallSummary: coerceString(obj.overallSummary),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'AI recipe cost analysis not configured',
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonFail('Invalid JSON body');
  }

  const recipes = Array.isArray(body.recipes) ? body.recipes : [];
  if (recipes.length === 0) {
    return jsonFail(
      'No recipes to analyze — add at least one recipe with ingredients first.'
    );
  }
  const inventory = Array.isArray(body.inventory) ? body.inventory : [];
  const journalEntries = Array.isArray(body.journalEntries)
    ? body.journalEntries
    : [];
  const priceHistory = Array.isArray(body.priceHistory) ? body.priceHistory : [];

  const recipeIds = new Set(recipes.map((r) => r.id));
  const itemById = new Map(inventory.map((it) => [it.id, it]));

  const tool: Anthropic.Tool = {
    name: TOOL_NAME,
    description:
      'Record per-recipe theoretical-vs-actual cost variance with flags, drivers and recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        perRecipe: {
          type: 'array',
          description: 'One insight per input recipe. recipeId must match exactly.',
          items: {
            type: 'object',
            properties: {
              recipeId: {
                type: 'string',
                description: 'Must match an id from the input recipes array.',
              },
              theoreticalCostPerPortion: {
                type: 'number',
                description:
                  'Sum(ingredient unitPrice * quantity) / yieldPortions. INR.',
              },
              actualCostPerPortion: {
                type: 'number',
                description:
                  'Estimated actual cost per portion using wastage + price drift signals. INR.',
              },
              variancePct: {
                type: 'number',
                description:
                  '(actual - theoretical) / theoretical * 100. Can be negative.',
              },
              foodCostPct: {
                type: 'number',
                description: 'actual / sellingPricePerPortion * 100.',
              },
              flag: {
                type: 'string',
                enum: [...FLAGS],
                description:
                  'ok (|variance| < 5), warning (5-15), critical (>15).',
              },
              drivers: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '1-4 specific phrases identifying what is driving the variance.',
              },
              recommendation: {
                type: 'string',
                description: 'One actionable sentence.',
              },
            },
            required: [
              'recipeId',
              'theoreticalCostPerPortion',
              'actualCostPerPortion',
              'variancePct',
              'foodCostPct',
              'flag',
              'drivers',
              'recommendation',
            ],
          },
        },
        overallSummary: {
          type: 'string',
          description:
            '2-3 sentences calling out worst offenders, avg food-cost %, and cross-cutting price pressure.',
        },
      },
      required: ['perRecipe', 'overallSummary'],
    },
  };

  const recipeLines: string[] = [];
  for (const r of recipes) {
    recipeLines.push(
      `Recipe id=${r.id} name="${r.name}" category="${r.category}" yieldPortions=${r.yieldPortions} sellingPricePerPortion=${r.sellingPricePerPortion}`
    );
    for (const ing of r.ingredients) {
      const inv = itemById.get(ing.itemId);
      recipeLines.push(
        `  - ingredient itemId=${ing.itemId} name="${
          inv?.name ?? 'unknown'
        }" qtyPerBatch=${ing.quantity} ${ing.unit} unitPrice=${
          inv?.unitPrice ?? 'unknown'
        }`
      );
    }
  }

  const journalLines = journalEntries
    .slice(0, 200)
    .map(
      (j) =>
        `- ${j.timestamp.slice(0, 10)} ${j.type} ${j.itemName ?? ''} qty=${
          j.quantity ?? ''
        } — ${j.description}`
    );

  const priceLines = priceHistory
    .slice(0, 150)
    .map((p) => `- ${p.date.slice(0, 10)} ${p.itemName}: INR ${p.unitPrice}`);

  const userText = [
    `Recipes (${recipes.length}):`,
    ...recipeLines,
    '',
    `Recent journal entries (${journalLines.length}, last 30d window):`,
    ...journalLines,
    '',
    `Recent price history (${priceLines.length}, last 60d window):`,
    ...priceLines,
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
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

    const data = normalizeOutput(toolUse.input, recipeIds);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[analyze-recipe-costs] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'Recipe cost analysis failed';
    return jsonFail(message);
  }
}
