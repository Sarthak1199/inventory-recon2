import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

interface Line {
  id: string;
  item_name: string;
  unit: string;
  ordered_qty: string;
  unit_price: string;
  ordered_amount: string;
}

interface Comparison {
  on_time_flag: string;
  fill_pct: string;
  fill_flag: string;
  price_variance_pct: string | null;
  cost_impact_amount: string;
}

interface PODetailData {
  id: string;
  po_number: string;
  status: string;
  expected_delivery_date: string | null;
  sent_at: string | null;
  total_amount: string;
  vendor_name: string;
  vendor_whatsapp: string | null;
  branch_name: string;
  lines: Line[];
  comparison: Comparison | null;
}

export function PODetail() {
  const { id } = useParams();
  const [po, setPo] = useState<PODetailData | null>(null);
  const [sending, setSending] = useState(false);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);

  async function load() {
    const res = await api.get(`/purchase-orders/${id}`);
    setPo(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSend() {
    setSending(true);
    try {
      const res = await api.post(`/purchase-orders/${id}/send`);
      setWaLink(res.data.waLink);
      setWaMessage(res.data.message);
      if (res.data.waLink) window.open(res.data.waLink, "_blank");
      await load();
    } finally {
      setSending(false);
    }
  }

  if (!po) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{po.po_number}</h1>
          <p className="text-sm text-gray-500">{po.branch_name} · {po.vendor_name}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{po.status.replace("_", " ")}</span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-400">
              <th className="py-1">Item</th>
              <th className="py-1">Qty</th>
              <th className="py-1">Unit price</th>
              <th className="py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id} className="border-t border-gray-50">
                <td className="py-1">{l.item_name} <span className="text-gray-400">({l.unit})</span></td>
                <td className="py-1">{l.ordered_qty}</td>
                <td className="py-1">₹{l.unit_price}</td>
                <td className="py-1">₹{l.ordered_amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-sm font-semibold text-gray-900">Total: ₹{po.total_amount}</p>
      </div>

      {po.comparison && (
        <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm">
          <div>
            <p className="text-gray-500">On-time</p>
            <p className="font-semibold capitalize">{po.comparison.on_time_flag.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-gray-500">Fill %</p>
            <p className="font-semibold">{Number(po.comparison.fill_pct).toFixed(1)}% ({po.comparison.fill_flag})</p>
          </div>
          <div>
            <p className="text-gray-500">Price variance</p>
            <p className="font-semibold">{po.comparison.price_variance_pct ? `${Number(po.comparison.price_variance_pct).toFixed(1)}%` : "N/A"}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-2 font-medium text-gray-900">Send to vendor via WhatsApp</h2>
        {po.vendor_whatsapp ? (
          <button onClick={handleSend} disabled={sending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {sending ? "Preparing..." : po.status === "draft" ? "Send PO" : "Resend PO"}
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
  );
}
