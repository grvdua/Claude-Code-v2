import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Note: Vercel's default serverless body limit is 4 MB. We clamp on the
// client to skip AI extraction for larger files, but enforce again here.
const MAX_AI_BYTES = 4 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const DOCUMENT_CATEGORIES = [
  'License',
  'Agreement',
  'Invoice',
  'Salary Slip',
  'Bill',
  'Other',
] as const;

interface ExtractedDocumentData {
  documentName: string;
  documentType: string;
  category: (typeof DOCUMENT_CATEGORIES)[number];
  licenseNumber: string;
  issuingAuthority: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  registeredEntity: string;
  notes: string;
}

const TOOL_NAME = 'record_document_metadata';

const SYSTEM_PROMPT =
  'You are an assistant that extracts structured metadata from Indian restaurant business documents (licenses, bills, agreements, salary slips, invoices). ' +
  'Extract only what is clearly visible in the document. Use empty strings for fields you cannot determine. ' +
  `Always call the ${TOOL_NAME} tool.`;

function isSupportedImageType(type: string): type is SupportedImageMediaType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function jsonOk(data: ExtractedDocumentData) {
  return NextResponse.json({ ok: true, data });
}

function jsonFail(error: string) {
  return NextResponse.json({ ok: false, error });
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceCategory(
  value: unknown
): (typeof DOCUMENT_CATEGORIES)[number] {
  if (
    typeof value === 'string' &&
    (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
  ) {
    return value as (typeof DOCUMENT_CATEGORIES)[number];
  }
  return 'Other';
}

function normalizeToolInput(input: unknown): ExtractedDocumentData {
  const obj =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    documentName: coerceString(obj.documentName),
    documentType: coerceString(obj.documentType),
    category: coerceCategory(obj.category),
    licenseNumber: coerceString(obj.licenseNumber),
    issuingAuthority: coerceString(obj.issuingAuthority),
    dateOfIssue: coerceString(obj.dateOfIssue),
    dateOfExpiry: coerceString(obj.dateOfExpiry),
    registeredEntity: coerceString(obj.registeredEntity),
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
      'Record structured metadata extracted from a business document.',
    input_schema: {
      type: 'object',
      properties: {
        documentName: {
          type: 'string',
          description:
            "Concise human-readable name for this document, e.g. 'Food Safety License' or 'Electricity Bill - July 2026'",
        },
        documentType: {
          type: 'string',
          description:
            "Specific type/category, e.g. 'FSSAI License', 'Fire NOC', 'Rent Agreement', 'Electricity Bill', 'Salary Slip', 'GST Invoice'",
        },
        category: {
          type: 'string',
          enum: [...DOCUMENT_CATEGORIES],
          description: "Best-fit category from the vault's fixed list",
        },
        licenseNumber: {
          type: 'string',
          description:
            'License/document/invoice number if printed on the document; empty string if not applicable',
        },
        issuingAuthority: {
          type: 'string',
          description:
            'Government body, regulator, company, or person issuing the document',
        },
        dateOfIssue: {
          type: 'string',
          description:
            'ISO date YYYY-MM-DD of issue/registration/grant if present, else empty string',
        },
        dateOfExpiry: {
          type: 'string',
          description:
            'ISO date YYYY-MM-DD of expiry/validity end if present, else empty string',
        },
        registeredEntity: {
          type: 'string',
          description:
            'Name of the business or person the document is issued to',
        },
        notes: {
          type: 'string',
          description:
            'Any additional useful context extracted, max 2 sentences',
        },
      },
      required: ['documentName', 'documentType', 'category'],
    },
  };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
              text: 'Extract metadata from this document.',
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) {
      return jsonFail('Model did not return structured metadata');
    }

    return jsonOk(normalizeToolInput(toolUse.input));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'AI extraction failed';
    return jsonFail(message);
  }
}
