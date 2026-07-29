import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

interface GrnLine {
  id: string;
  item_name: string | null;
  raw_item_name: string | null;
  unit: string | null;
  received_qty: string;
  unit_price: string;
  received_amount: string;
  is_off_po: boolean;
  match_type: string;
}

interface GrnDetailData {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  received_date: string | null;
  ocr_status: string;
  file_url: string;
  branch_name: string;
  vendor_name: string | null;
  vendor_whatsapp: string | null;
  po_number: string | null;
  lines: GrnLine[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  parsed: "bg-blue-100 text-blue-700",
  needs_review: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
};

export function GRNDetail() {
  const { id } = useParams();
  const [grn, setGrn] = useState<GrnDetailData | null>(null);
  const [sending, setSending] = useState(false);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/grns/${id}`).then((res) => setGrn(res.data));
  }, [id]);

  async function handleShare() {
    setSending(true);
    try {
      const res = await api.post(`/grns/${id}/share-wa`);
      setWaLink(res.data.waLink);
      setWaMessage(res.data.message);
      if (res.data.waLink) window.open(res.data.waLink, "_blank");
    } finally {
      setSending(false);
    }
  }

  if (!grn) return <p className="text-sm text-gray-500">Loading...</p>;

  const total = grn.lines.reduce((s, l) => s + Number(l.received_amount), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{grn.invoice_number ?? "GRN (no invoice #)"}</h1>
          <p className="text-sm text-gray-500">
            {grn.branch_name}
            {grn.vendor_name ? ` · ${grn.vendor_name}` : ""}
            {grn.po_number ? ` · Linked to ${grn.po_number}` : " · Off-PO"}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[grn.ocr_status] ?? ""}`}>
          {grn.ocr_status.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-gray-900">Source document</h2>
          {grn.file_url.endsWith(".pdf") ? (
            <embed src={grn.file_url} className="h-[500px] w-full" />
          ) : (
            <img src={grn.file_url} alt="GRN source" className="w-full rounded-md border border-gray-100" />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-gray-500">Invoice date</dt>
              <dd className="text-gray-900">{grn.invoice_date?.slice(0, 10) ?? "N/A"}</dd>
              <dt className="text-gray-500">Received date</dt>
              <dd className="text-gray-900">{grn.received_date?.slice(0, 10) ?? "N/A"}</dd>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-gray-900">Line items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400">
                  <th className="py-1">Item</th>
                  <th className="py-1">Qty</th>
                  <th className="py-1">Price</th>
                  <th className="py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {grn.lines.map((l) => (
                  <tr key={l.id} className="border-t border-gray-50">
                    <td className="py-1">
                      {l.item_name ?? l.raw_item_name ?? "Unmatched"}
                      {l.is_off_po && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-600">off-PO</span>}
                    </td>
                    <td className="py-1">{l.received_qty} {l.unit ?? ""}</td>
                    <td className="py-1">Rs.{l.unit_price}</td>
                    <td className="py-1">Rs.{l.received_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right text-sm font-semibold text-gray-900">Total: Rs.{total.toFixed(2)}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-gray-900">Share on WhatsApp</h2>
            {grn.vendor_whatsapp ? (
              <button onClick={handleShare} disabled={sending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {sending ? "Preparing..." : "Share GRN summary"}
              </button>
            ) : (
              <p className="text-sm text-amber-600">Vendor has no WhatsApp number on file.</p>
            )}
            {waLink && (
              <div className="mt-3 space-y-2">
                <a href={waLink} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">
                  Open WhatsApp
                </a>
                <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-600">{waMessage}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      <Link to="/grns" className="inline-block text-sm text-brand">
        Back to GRNs
      </Link>
    </div>
  );
}
