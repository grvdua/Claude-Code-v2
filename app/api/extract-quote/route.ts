import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ExtractedQuoteData,
  ExtractedQuoteLineItem,
} from '@/lib/types';
import { normalizeDate } from '@/lib/dateUtils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AI_BYTES = 4 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const TOOL_NAME = 'record_quote';

const SYSTEM_PROMPT = `You are extracting data from an Indian restaurant vendor quotation / RFQ response / proforma. These are NOT yet invoices — they are price offers and may include "Quote", "Quotation", "RFQ Response", "Proforma Invoice", "Price List", or "Estimate" headers.

CRITICAL EXTRACTION RULES:

1. vendorName: The supplier offering the quote (the party ISSUING the quote). Look at the letterhead / "From:" / "Quote from:". NOT the buyer / "Quote to:" — that is the restaurant.

2. items: Every line item being quoted:
   - name: item description (e.g. "Paneer", "Basmati Rice 25kg bag")
   - quantity: numeric quantity offered
   - unit: kg, litre/L, pcs, dozen, packet, box, bag. Normalize "Kgs"/"KG" -> "kg", "Ltr"/"Liter" -> "litre".
   - unitPrice: rate per unit being quoted (before GST if printed separately, else inclusive)
   - totalPrice: line total

3. totalAmount: The final quoted amount payable (after taxes/discounts). Use 0 if not visible.

4. deliveryDate: ISO YYYY-MM-DD the vendor proposes to deliver. Often phrased "Delivery in 3 days", "ETA: 12 Jan". Indian docs use DD/MM/YYYY. Empty string if not visible. If the doc says "within N days" return an empty string (we don't try to compute relative dates here).

5. validUntil: ISO YYYY-MM-DD the quote is valid until. Look for "Valid till", "Quote expires", "Valid for 7 days". Empty string if not visible.

6. notes: Optional context (payment terms, MOQ, freight inclusion, freebies, payment terms). 1-2 sentences. Empty string if nothing notable.

DATE FORMAT: ALWAYS ISO YYYY-MM-DD. Empty string if missing.
NUMBERS: Plain numbers (no "Rs.", no commas). Use 0 if not visible.

Do NOT guess. Always call the ${TOOL_NAME} tool.`;

function isSupportedImageType(type: string): type is SupportedImageMediaType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function jsonOk(data: ExtractedQuoteData) {
  return NextResponse.json({ ok: true, data });
}

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

function coerceItems(value: unknown): ExtractedQuoteLineItem[] {
  if (!Array.isArray(value)) return [];
  const out: ExtractedQuoteLineItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const name = coerceString(obj.name).trim();
    if (!name) continue;
    const qty = coerceNumber(obj.quantity);
    const unitPrice = coerceNumber(obj.unitPrice);
    const totalPrice =
      obj.totalPrice !== undefined
        ? coerceNumber(obj.totalPrice)
        : qty * unitPrice;
    out.push({
      name,
      quantity: qty,
      unit: coerceString(obj.unit) || 'unit',
      unitPrice,
      totalPrice,
    });
  }
  return out;
}

function normalizeToolInput(input: unknown): ExtractedQuoteData {
  const obj =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    vendorName: coerceString(obj.vendorName),
    items: coerceItems(obj.items),
    totalAmount: coerceNumber(obj.totalAmount),
    deliveryDate: normalizeDate(coerceString(obj.deliveryDate)),
    validUntil: normalizeDate(coerceString(obj.validUntil)),
    notes: coerceString(obj.notes),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonFail('AI extraction not configured');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonFail('Could not read uploaded file');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonFail('No file uploaded');
  }

  if (file.size > MAX_AI_BYTES) {
    return jsonFail('File too large for AI extraction');
  }

  const fileType = file.type || 'application/octet-stream';
  const isPdf = fileType === 'application/pdf';
  const isImage = isSupportedImageType(fileType);
  if (!isPdf && !isImage) {
    return jsonFail('Unsupported file type for AI extraction');
  }

  let base64: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    base64 = buffer.toString('base64');
  } catch {
    return jsonFail('Could not read file contents');
  }

  const documentBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: fileType as SupportedImageMediaType,
          data: base64,
        },
      };

  const tool: Anthropic.Tool = {
    name: TOOL_NAME,
    description:
      'Record structured data extracted from an Indian restaurant vendor quotation / RFQ response.',
    input_schema: {
      type: 'object',
      properties: {
        vendorName: {
          type: 'string',
          description:
            "The supplier offering the quote (party ISSUING the quote). NOT the buyer.",
        },
        items: {
          type: 'array',
          description: 'Every quoted line item.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Item description as printed.',
              },
              quantity: {
                type: 'number',
                description: 'Numeric quantity quoted. Use 0 if not visible.',
              },
              unit: {
                type: 'string',
                description:
                  "Normalize 'Kgs'/'KG' -> 'kg', 'Ltr'/'Liter' -> 'litre'. Empty string if not visible.",
              },
              unitPrice: {
                type: 'number',
                description: 'Rate per unit as a plain number.',
              },
              totalPrice: {
                type: 'number',
                description: 'Line total or quantity * unitPrice.',
              },
            },
            required: ['name', 'quantity', 'unitPrice'],
          },
        },
        totalAmount: {
          type: 'number',
          description:
            "Total quoted amount as a plain number (no currency, no commas). 0 if not visible.",
        },
        deliveryDate: {
          type: 'string',
          description:
            "ISO YYYY-MM-DD the vendor proposes to deliver. Empty string if 'within N days' or not visible.",
        },
        validUntil: {
          type: 'string',
          description:
            "ISO YYYY-MM-DD the quote is valid until. Empty string if not visible.",
        },
        notes: {
          type: 'string',
          description:
            'Optional terms (payment, MOQ, freight inclusion). Max 2 sentences. Empty string if nothing notable.',
        },
      },
      required: ['vendorName', 'items'],
    },
  };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            documentBlock,
            {
              type: 'text',
              text: 'Extract structured data from this vendor quote. Include every line item. Use the SUPPLIER name as vendorName, not the buyer. Dates in YYYY-MM-DD.',
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) {
      return jsonFail('Model did not return structured data');
    }

    return jsonOk(normalizeToolInput(toolUse.input));
  } catch (err) {
    console.error('[extract-quote] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'AI quote extraction failed';
    return jsonFail(message);
  }
}
