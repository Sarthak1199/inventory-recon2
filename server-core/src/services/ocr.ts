import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface OcrLine {
  item_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  hsn_code: string | null;
  cgst_pct: number | null;
  sgst_pct: number | null;
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
    { "item_name": string, "qty": number, "unit_price": number, "amount": number, "hsn_code": string | null, "cgst_pct": number | null, "sgst_pct": number | null }
  ]
}
Rules:
- If a field is illegible or absent, use null (or omit the line if a whole row is unreadable).
- amount should equal qty * unit_price when both are present; if the printed amount differs, prefer the printed amount.
- hsn_code is the HSN/SAC code printed for that line item, if any.
- cgst_pct and sgst_pct are the CGST and SGST tax rates (as plain numbers, e.g. 2.5 for 2.5%) that apply to that line item. If the invoice only shows a single blended GST rate per item (not split into CGST/SGST), divide it evenly between cgst_pct and sgst_pct. If tax rates are shown only as a bill-level summary rather than per line, apply that same rate to every line it covers. Use null if no tax rate is determinable for a line.
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
