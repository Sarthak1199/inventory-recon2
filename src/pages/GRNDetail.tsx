import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { WhatsAppSendCard } from "../components/WhatsAppSendCard";

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
  hsn_code: string | null;
  cgst_pct: string | null;
  sgst_pct: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
}

interface GrnDetailData {
  id: string;
  grn_number: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  received_date: string | null;
  ocr_status: string;
  file_url: string;
  branch_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_whatsapp: string | null;
  po_number: string | null;
  lines: GrnLine[];
  subtotal_amount: string | null;
  total_cgst: string | null;
  total_sgst: string | null;
  total_gst: string | null;
  bill_total: string | null;
  waPreview: { message: string; waLink: string | null } | null;
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
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    api.get(`/grns/${id}`).then((res) => setGrn(res.data));
  }, [id]);

  if (!grn) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  const subtotal = grn.subtotal_amount != null ? Number(grn.subtotal_amount) : grn.lines.reduce((s, l) => s + Number(l.received_amount), 0);
  const totalCgst = grn.total_cgst != null ? Number(grn.total_cgst) : grn.lines.reduce((s, l) => s + Number(l.cgst_amount ?? 0), 0);
  const totalSgst = grn.total_sgst != null ? Number(grn.total_sgst) : grn.lines.reduce((s, l) => s + Number(l.sgst_amount ?? 0), 0);
  const totalGst = grn.total_gst != null ? Number(grn.total_gst) : totalCgst + totalSgst;
  const billTotal = grn.bill_total != null ? Number(grn.bill_total) : subtotal + totalGst;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{grn.grn_number ?? grn.invoice_number ?? "GRN"}</h1>
          <p className="text-sm text-gray-500">
            {grn.invoice_number ? `Invoice ${grn.invoice_number} · ` : ""}
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
          {imageFailed ? (
            <div className="flex h-64 w-full items-center justify-center rounded-md border border-gray-100 bg-gray-50 text-sm text-gray-400">
              Source document unavailable.
            </div>
          ) : grn.file_url.endsWith(".pdf") ? (
            <embed src={grn.file_url} className="h-[500px] w-full" />
          ) : (
            <img
              src={grn.file_url}
              alt="GRN source"
              className="w-full rounded-md border border-gray-100"
              onError={() => setImageFailed(true)}
            />
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-400">
                    <th className="py-1 pr-3">Item</th>
                    <th className="py-1 px-3">HSN</th>
                    <th className="py-1 px-3 text-right">Qty</th>
                    <th className="py-1 px-3 text-right">Price</th>
                    <th className="py-1 px-3 text-right">GST%</th>
                    <th className="py-1 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {grn.lines.map((l) => (
                    <tr key={l.id} className="border-t border-gray-50">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {l.item_name ?? l.raw_item_name ?? "Unmatched"}
                        {l.is_off_po && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-600">off-PO</span>}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-gray-500">{l.hsn_code ?? "-"}</td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">{l.received_qty} {l.unit ?? ""}</td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">Rs.{l.unit_price}</td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap text-gray-500">
                        {l.cgst_pct != null || l.sgst_pct != null ? `${l.cgst_pct ?? 0}+${l.sgst_pct ?? 0}` : "-"}
                      </td>
                      <td className="py-1.5 pl-3 text-right whitespace-nowrap">Rs.{l.received_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-3 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>Rs.{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>CGST</span>
                <span>Rs.{totalCgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>SGST</span>
                <span>Rs.{totalSgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Total GST</span>
                <span>Rs.{totalGst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Bill total</span>
                <span>Rs.{billTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <WhatsAppSendCard
            previewUrl={`/grns/${id}/wa-preview`}
            sendUrl={`/grns/${id}/share-wa`}
            actionLabel="Share on WhatsApp"
            initialPreview={grn.waPreview}
          />
        </div>
      </div>

      <Link to="/grns" className="inline-block text-sm text-brand">
        Back to GRNs
      </Link>
    </div>
  );
}
