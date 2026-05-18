import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ExtractedInvoiceData,
  InvoiceLineItem,
  InvoiceType,
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

const INVOICE_TYPES: readonly InvoiceType[] = [
  'raw-material',
  'utility',
  'rent',
  'packaging',
  'marketing',
  'housekeeping',
  'other',
] as const;

const TOOL_NAME = 'record_invoice';

const SYSTEM_PROMPT = `You are extracting data from an Indian restaurant business invoice. These can be GST tax invoices, retail invoices, utility bills, rent receipts, packaging supplier invoices, or housekeeping/laundry bills.

CRITICAL EXTRACTION RULES:

1. invoiceType: Classify the invoice:
   - raw-material: food ingredients, vegetables, meat, dairy, grains, spices, beverages, kitchen consumables
   - utility: electricity, water, gas (LPG/PNG), internet, telephone
   - rent: rent receipts, lease payments
   - packaging: takeaway boxes, paper bags, cutlery, cling film
   - marketing: advertising, printing, digital ads
   - housekeeping: cleaning supplies, laundry, pest control
   - other: anything that doesn't fit

2. vendorName: The SUPPLIER/seller name (the party issuing the invoice). Look for the top-of-document letterhead, "From:", "Seller:", "Supplier:", or the company name above the GSTIN. NOT the "Bill To" / "Buyer" / "Consignee" — that is the restaurant.

3. vendorGstin: The supplier's 15-character GSTIN (state-code + 10-char PAN + 3 chars). Format like "27AAACI1234A1Z5". Look near the supplier name. Empty string if not present.

4. invoiceNumber: Look for "Invoice No.", "Bill No.", "Tax Invoice", "Reference No.". This is the supplier's identifier for the invoice.

5. invoiceDate: ISO date YYYY-MM-DD. Look for "Invoice Date", "Bill Date", "Date". Indian invoices usually print DD/MM/YYYY or DD-MM-YYYY — interpret accordingly (e.g. "12/01/2026" -> "2026-01-12", "12-Jan-2026" -> "2026-01-12").

6. totalAmount: Final amount payable (after GST/discounts). Look for "Total", "Grand Total", "Amount Payable", "Net Amount". A number, not a string. Do NOT include currency symbols.

7. lineItems: For raw-material invoices, extract EVERY line:
   - name: item description as printed (e.g. "Paneer", "Basmati Rice 25kg bag", "Sunflower Oil")
   - quantity: numeric quantity
   - unit: kg, litre/L, pcs, dozen, packet, box, bag. Normalize "Kgs"/"KG" -> "kg", "Ltr"/"Liter" -> "litre".
   - unitPrice: rate per unit (before GST if printed separately, else inclusive)
   - totalPrice: line total
   For non-raw-material invoices line items are optional.

DATE FORMAT: ALWAYS return dates in ISO YYYY-MM-DD. Use empty string if not visible.
NUMBERS: Return as plain numbers (not strings, no "Rs.", no commas). Use 0 if not visible.

Do NOT guess. Use empty strings/zero when a field is genuinely not visible on the document. Always call the ${TOOL_NAME} tool.`;

function isSupportedImageType(type: string): type is SupportedImageMediaType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function jsonOk(data: ExtractedInvoiceData) {
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

function coerceInvoiceType(value: unknown): InvoiceType {
  if (
    typeof value === 'string' &&
    (INVOICE_TYPES as readonly string[]).includes(value)
  ) {
    return value as InvoiceType;
  }
  return 'other';
}

function coerceLineItems(value: unknown): InvoiceLineItem[] {
  if (!Array.isArray(value)) return [];
  const out: InvoiceLineItem[] = [];
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

function normalizeToolInput(input: unknown): ExtractedInvoiceData {
  const obj =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    invoiceType: coerceInvoiceType(obj.invoiceType),
    vendorName: coerceString(obj.vendorName),
    vendorGstin: coerceString(obj.vendorGstin),
    invoiceNumber: coerceString(obj.invoiceNumber),
    invoiceDate: normalizeDate(coerceString(obj.invoiceDate)),
    totalAmount: coerceNumber(obj.totalAmount),
    currency: coerceString(obj.currency) || 'INR',
    lineItems: coerceLineItems(obj.lineItems),
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
      'Record structured data extracted from an Indian restaurant business invoice or bill.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceType: {
          type: 'string',
          enum: [...INVOICE_TYPES],
          description:
            "Classification: raw-material (food ingredients, vegetables, meat, dairy, grains, spices, kitchen consumables), utility (electricity/water/gas/internet), rent, packaging (takeaway boxes/cutlery), marketing (ads/printing), housekeeping (cleaning/laundry/pest), other.",
        },
        vendorName: {
          type: 'string',
          description:
            "The supplier/seller (the party ISSUING the invoice). Look at the letterhead, 'From:', 'Seller:', 'Supplier:'. Do NOT use the 'Bill To'/'Buyer' name.",
        },
        vendorGstin: {
          type: 'string',
          description:
            "Supplier's 15-character GSTIN (state-code + PAN + 3 chars), e.g. '27AAACI1234A1Z5'. Empty string if not printed.",
        },
        invoiceNumber: {
          type: 'string',
          description:
            "Invoice/bill identifier from labels: 'Invoice No.', 'Bill No.', 'Tax Invoice', 'Reference No.'. Empty string if not present.",
        },
        invoiceDate: {
          type: 'string',
          description:
            "ISO date YYYY-MM-DD when the invoice was issued. Look for 'Invoice Date', 'Bill Date', 'Date'. Indian invoices commonly use DD/MM/YYYY. Convert any format to YYYY-MM-DD. Empty string if not present.",
        },
        totalAmount: {
          type: 'number',
          description:
            "Final amount payable as a number (no currency symbols, no commas). Look for 'Total', 'Grand Total', 'Amount Payable', 'Net Amount'. Use 0 if not present.",
        },
        currency: {
          type: 'string',
          default: 'INR',
          description: 'ISO currency code. Default INR for Indian invoices.',
        },
        lineItems: {
          type: 'array',
          description:
            'Every line item on the invoice. Required for raw-material invoices; optional for utility/rent/etc. Skip header rows and totals.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description:
                  "Item description as printed, e.g. 'Paneer', 'Basmati Rice', 'Sunflower Oil 1L pouch'.",
              },
              quantity: {
                type: 'number',
                description: 'Numeric quantity. Use 0 if not visible.',
              },
              unit: {
                type: 'string',
                description:
                  "Unit of measure. Normalize: 'Kgs'/'KG' -> 'kg', 'Ltr'/'Liter' -> 'litre', 'Nos'/'pcs' -> 'unit'. Empty string if not visible.",
              },
              unitPrice: {
                type: 'number',
                description:
                  'Rate per unit as a plain number. Use 0 if not visible.',
              },
              totalPrice: {
                type: 'number',
                description:
                  'Line total (quantity * unitPrice or as printed). Use 0 if not visible.',
              },
            },
            required: ['name', 'quantity', 'unitPrice'],
          },
        },
        notes: {
          type: 'string',
          description:
            'Optional context (delivery address, GST breakdown, payment terms). Max 2 sentences. Empty string if nothing notable.',
        },
      },
      required: ['invoiceType', 'vendorName'],
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
              text: 'Extract invoice data. If this is a raw-material invoice, include every line item with quantity, unit, unit price, and total. Return invoiceDate in YYYY-MM-DD format. Be careful to use the SUPPLIER name as vendorName, not the buyer.',
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
    console.error('[extract-invoice] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'AI invoice extraction failed';
    return jsonFail(message);
  }
}
