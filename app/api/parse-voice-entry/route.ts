import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { VoiceFormType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ParseRequest {
  transcript: string;
  formType: VoiceFormType;
}

function jsonFail(error: string) {
  return NextResponse.json({ ok: false, error });
}

function jsonOk(data: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data });
}

const FORM_TOOLS: Record<VoiceFormType, Anthropic.Tool> = {
  expense: {
    name: 'fill_expense_form',
    description: 'Fill an expense entry form from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            "One of: Utilities, Repairs, Cleaning, Marketing, Staff, Misc",
        },
        amount: { type: 'number', description: 'Amount in INR (number only).' },
        vendor: { type: 'string' },
        notes: { type: 'string' },
        date: { type: 'string', description: 'ISO YYYY-MM-DD; empty for today.' },
      },
      required: ['amount'],
    },
  },
  wastage: {
    name: 'fill_wastage_form',
    description: 'Fill a kitchen wastage entry form from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string', description: 'kg, litre, unit, etc.' },
        reason: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['itemName', 'quantity'],
    },
  },
  'material-request': {
    name: 'fill_material_request_form',
    description: 'Fill a chef material request form from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
        notes: { type: 'string' },
      },
      required: ['itemName', 'quantity'],
    },
  },
  journal: {
    name: 'fill_journal_entry',
    description: 'Fill a chef journal entry from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['prep', 'batch', 'marination', 'wastage'],
        },
        description: { type: 'string' },
        itemName: { type: 'string' },
        quantity: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['description'],
    },
  },
  'inventory-adjust': {
    name: 'fill_inventory_adjust',
    description: 'Fill an inventory adjustment from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        itemName: { type: 'string' },
        location: {
          type: 'string',
          enum: ['restaurant', 'store-1', 'store-2'],
        },
        delta: {
          type: 'number',
          description: 'Positive to add, negative to remove.',
        },
        notes: { type: 'string' },
      },
      required: ['itemName', 'delta'],
    },
  },
  attendance: {
    name: 'fill_attendance',
    description:
      'Mark staff attendance from a voice transcript (e.g. "mark Rahul present").',
    input_schema: {
      type: 'object',
      properties: {
        staffName: { type: 'string' },
        present: { type: 'boolean' },
      },
      required: ['staffName', 'present'],
    },
  },
  'document-meta': {
    name: 'fill_document_meta',
    description: 'Fill document vault metadata from a voice transcript.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: {
          type: 'string',
          enum: [
            'License',
            'Agreement',
            'Invoice',
            'Bill',
            'Salary Slip',
            'Other',
          ],
        },
        documentType: { type: 'string' },
        issuingAuthority: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
};

const SYSTEM_PROMPT =
  'You convert spoken transcripts into structured form data for an Indian restaurant operations app. ' +
  'Be tolerant of Hinglish and informal phrasing. Use empty strings/zero when something is not in the transcript.';

function isVoiceFormType(value: unknown): value is VoiceFormType {
  return (
    typeof value === 'string' &&
    (
      [
        'expense',
        'wastage',
        'material-request',
        'journal',
        'inventory-adjust',
        'attendance',
        'document-meta',
      ] as readonly string[]
    ).includes(value)
  );
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonFail('AI parsing not configured');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonFail('Invalid JSON');
  }

  if (!body || typeof body !== 'object') return jsonFail('Invalid body');
  const parsed = body as Partial<ParseRequest>;
  const transcript =
    typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';
  if (!transcript) return jsonFail('Empty transcript');
  if (!isVoiceFormType(parsed.formType)) return jsonFail('Invalid formType');

  const tool = FORM_TOOLS[parsed.formType];

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [
        {
          role: 'user',
          content: `Form type: ${parsed.formType}\nTranscript: ${transcript}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (!toolUse) return jsonFail('No structured output');
    const input =
      toolUse.input && typeof toolUse.input === 'object'
        ? (toolUse.input as Record<string, unknown>)
        : {};
    return jsonOk(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI parsing failed';
    return jsonFail(msg);
  }
}
