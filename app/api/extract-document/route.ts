import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeDate } from '@/lib/dateUtils';

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

const SYSTEM_PROMPT = `You are extracting metadata from Indian restaurant business documents: FSSAI food licenses, fire NOC certificates, GST registration, shop & establishment licenses, trade licenses, rent agreements, vendor invoices, electricity/water bills, salary slips, and similar.

CRITICAL EXTRACTION RULES:

1. dateOfIssue (date of grant/registration/issue): Look for labels like "Date of Issue", "Issued on", "Date of Registration", "License granted on", "Valid from", "Issue Date", "Date of Grant", "Effective from". On FSSAI licenses this appears near the top. On invoices this is the invoice date.

2. dateOfExpiry: Look for "Valid up to", "Valid till", "Date of Expiry", "Expiry Date", "Valid until", "Renewal due", "Validity". On FSSAI it's printed prominently.

3. issuingAuthority: Look for the government body or organization that issued the document. Examples:
   - FSSAI license -> "Food Safety and Standards Authority of India" (or the state designated officer)
   - Fire NOC -> state fire service (e.g., "Maharashtra Fire Service", "Delhi Fire Service")
   - GST -> "Goods and Services Tax Department"
   - Shop & Establishment -> state labour department (e.g., "Department of Labour, Government of Maharashtra")
   - Trade License -> local municipal corporation (e.g., "Brihanmumbai Municipal Corporation")
   - Rent Agreement -> not government-issued; use lessor's name or "Notarized"
   - Vendor invoice -> vendor company name

4. licenseNumber: The unique identifier printed on the document. FSSAI numbers are 14 digits. GSTIN is 15 alphanumeric. Look for "License No.", "Registration No.", "Certificate No.", "GSTIN", "Invoice No.".

5. registeredEntity: The business/person the document is issued TO (not the issuer). Look for "Name of the FBO", "Trade Name", "Legal Name", "Name of Establishment", "Issued to", "Bill to".

DATE FORMAT: ALWAYS return dates in ISO format YYYY-MM-DD. Convert "12/01/2026" -> "2026-01-12" (interpret as DD/MM/YYYY for Indian docs), "12-Jan-2026" -> "2026-01-12", "12th January 2026" -> "2026-01-12". If only month/year is visible, use the first day of that month.

If a field is genuinely not present in the document, return an empty string for that field. Do NOT guess or hallucinate dates or authorities. Always invoke the ${TOOL_NAME} tool.`;

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
    dateOfIssue: normalizeDate(coerceString(obj.dateOfIssue)),
    dateOfExpiry: normalizeDate(coerceString(obj.dateOfExpiry)),
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
      'Record structured metadata extracted from an Indian restaurant business document.',
    input_schema: {
      type: 'object',
      properties: {
        documentName: {
          type: 'string',
          description:
            "Concise human-readable name for this document, e.g. 'FSSAI Food License', 'Electricity Bill - July 2026', 'Rent Agreement - Andheri Branch'. Should describe what the document IS, not the vendor.",
        },
        documentType: {
          type: 'string',
          description:
            "Specific type, e.g. 'FSSAI License', 'Fire NOC', 'GST Registration', 'Shop & Establishment License', 'Trade License', 'Rent Agreement', 'Electricity Bill', 'Water Bill', 'Salary Slip', 'GST Tax Invoice'.",
        },
        category: {
          type: 'string',
          enum: [...DOCUMENT_CATEGORIES],
          description:
            "Best-fit category. License = government-issued operating permits (FSSAI, Fire NOC, GST, Shop & Estd, Trade). Agreement = contracts (Rent, lease). Invoice = vendor tax invoices for goods/services. Bill = utility/recurring (electricity, water, internet). Salary Slip = employee payslips. Other = anything else.",
        },
        licenseNumber: {
          type: 'string',
          description:
            "The unique identifier printed on the document. FSSAI = 14 digits. GSTIN = 15 alphanumeric. Look for labels: 'License No.', 'Registration No.', 'Certificate No.', 'GSTIN', 'Invoice No.', 'Bill No.'. Empty string if not present.",
        },
        issuingAuthority: {
          type: 'string',
          description:
            "Government body, regulator, company or person that issued the document. FSSAI -> 'Food Safety and Standards Authority of India'. Fire NOC -> state fire service. GST -> 'Goods and Services Tax Department'. Shop & Estd -> state labour department. Trade License -> local municipal corporation. Vendor invoice -> vendor name. Utility bill -> utility provider (BSES, MSEB etc.). Empty string if not present.",
        },
        dateOfIssue: {
          type: 'string',
          description:
            "ISO date YYYY-MM-DD when the document was issued/granted/registered. Look for labels: 'Date of Issue', 'Issued on', 'Date of Registration', 'License granted on', 'Valid from', 'Issue Date', 'Date of Grant', 'Effective from'. For invoices/bills this is the invoice/bill date. Convert any format to YYYY-MM-DD (treat ambiguous DD/MM/YYYY as Indian convention). Empty string if not present.",
        },
        dateOfExpiry: {
          type: 'string',
          description:
            "ISO date YYYY-MM-DD when the document expires. Look for labels: 'Valid up to', 'Valid till', 'Date of Expiry', 'Expiry Date', 'Valid until', 'Renewal due', 'Validity'. On FSSAI licenses this is printed prominently. Convert any date format to YYYY-MM-DD. Empty string if not present.",
        },
        registeredEntity: {
          type: 'string',
          description:
            "Name of the business or person the document is issued TO (not the issuer). Look for 'Name of the FBO', 'Trade Name', 'Legal Name', 'Name of Establishment', 'Issued to', 'Bill to', 'Consumer Name'. Empty string if not present.",
        },
        notes: {
          type: 'string',
          description:
            'Any additional useful context (address, capacity, period covered, conditions). Max 2 sentences. Empty string if nothing notable.',
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
              text: 'Extract metadata from this document. Pay special attention to the date of issue, date of expiry, and issuing authority — these are the most important fields and the ones most often missed. Return all dates in YYYY-MM-DD format.',
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
    console.error('[extract-document] Claude API error:', err);
    const message =
      err instanceof Error ? err.message : 'AI extraction failed';
    return jsonFail(message);
  }
}
