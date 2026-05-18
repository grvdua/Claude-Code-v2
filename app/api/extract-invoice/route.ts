import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ExtractedInvoiceData,
  InvoiceLineItem,
  InvoiceType,
} from '@/lib/types';

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

const SYSTEM_PROMPT =
  'Extract structured data from an Indian restaurant business invoice. ' +
  'Classify the invoice type. If it is a raw material invoice (food ingredients, beverages, kitchen supplies), ' +
  'extract every line item with quantity, unit, and price. For other invoice types, line items are optional. ' +
  'Use empty strings/zero when data is not visible. ' +
  `Always call the ${TOOL_NAME} tool.`;

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
    invoiceDate: coerceString(obj.invoiceDate),
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
    description: 'Record structured data extracted from a business invoice.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceType: {
          type: 'string',
          enum: [...INVOICE_TYPES],
          description: 'Best-fit classification of the invoice.',
        },
        vendorName: { type: 'string', description: 'Name of the vendor / supplier.' },
        vendorGstin: { type: 'string', description: 'GSTIN if printed, else empty.' },
        invoiceNumber: { type: 'string' },
        invoiceDate: {
          type: 'string',
          description: 'ISO date YYYY-MM-DD',
        },
        totalAmount: { type: 'number' },
        currency: { type: 'string', default: 'INR' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              unit: {
                type: 'string',
                description: 'kg, litre, pcs, etc.',
              },
              unitPrice: { type: 'number' },
              totalPrice: { type: 'number' },
            },
            required: ['name', 'quantity', 'unitPrice'],
          },
        },
        notes: { type: 'string' },
      },
      required: ['invoiceType', 'vendorName'],
    },
  };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
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
              text: 'Extract invoice data. If raw material, include all line items.',
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
    const message =
      err instanceof Error ? err.message : 'AI invoice extraction failed';
    return jsonFail(message);
  }
}
