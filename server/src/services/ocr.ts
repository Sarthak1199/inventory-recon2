import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface OcrLine {
  item_name: string;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface OcrResult {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  lines: OcrLine[];
}

const SYSTEM_PROMPT = `You extract structured data from restaurant supplier GRN/invoice images or PDFs.
Return ONLY valid JSON, no prose, matching exactly this shape:
{
  "invoice_number": string | null,
  "invoice_date": string | null,   // ISO format YYYY-MM-DD, null if unreadable
  "vendor_name": string | null,
  "lines": [
    { "item_name": string, "qty": number, "unit_price": number, "amount": number }
  ]
}
Rules:
- If a field is illegible or absent, use null (or omit the line if a whole row is unreadable).
- amount should equal qty * unit_price when both are present; if the printed amount differs, prefer the printed amount.
- Do not invent line items. Do not include tax/subtotal/total rows in "lines".
- Numbers must be plain numbers (no currency symbols or commas).`;

export async function extractGrnData(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const data = buffer.toString("base64");

  const contentBlock =
    mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mimeType as any, data } } as const);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          contentBlock as any,
          { type: "text", text: "Extract the invoice/GRN data as JSON per the schema in your instructions." },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  const jsonText = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "");

  try {
    const parsed = JSON.parse(jsonText);
    return {
      invoice_number: parsed.invoice_number ?? null,
      invoice_date: parsed.invoice_date ?? null,
      vendor_name: parsed.vendor_name ?? null,
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch {
    return { invoice_number: null, invoice_date: null, vendor_name: null, lines: [] };
  }
}
