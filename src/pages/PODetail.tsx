import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { WhatsAppSendCard } from "../components/WhatsAppSendCard";

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
  created_at: string;
  expected_delivery_date: string | null;
  sent_at: string | null;
  total_amount: string;
  vendor_id: string;
  vendor_name: string;
  vendor_whatsapp: string | null;
  branch_name: string;
  lines: Line[];
  comparison: Comparison | null;
  waPreview: { message: string; waLink: string | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-500",
};

export function PODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [po, setPo] = useState<PODetailData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get(`/purchase-orders/${id}`).then((res) => setPo(res.data));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/purchase-orders/${id}`);
      showToast("Purchase order deleted.");
      navigate("/purchase-orders");
    } catch {
      showToast("Failed to delete purchase order.", "error");
      setDeleting(false);
    }
  }

  if (!po) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-dashed border-gray-200 px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Purchase Order</p>
              <h1 className="text-2xl font-bold text-gray-900">{po.po_number}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[po.status] ?? ""}`}>
                {po.status.replace("_", " ")}
              </span>
              <Link
                to={`/purchase-orders/${id}/edit`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit
              </Link>
              {confirmDelete ? (
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting..." : "Confirm delete"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <div>
              <p className="text-gray-400">Branch</p>
              <p className="font-medium text-gray-900">{po.branch_name}</p>
            </div>
            <div>
              <p className="text-gray-400">Vendor</p>
              <p className="font-medium text-gray-900">{po.vendor_name}</p>
            </div>
            <div>
              <p className="text-gray-400">Created</p>
              <p className="font-medium text-gray-900">{po.created_at?.slice(0, 10)}</p>
            </div>
            <div>
              <p className="text-gray-400">Expected delivery</p>
              <p className="font-medium text-gray-900">{po.expected_delivery_date?.slice(0, 10) ?? "N/A"}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900">{l.item_name} <span className="text-gray-400">({l.unit})</span></td>
                  <td className="py-2 text-right text-gray-700">{l.ordered_qty}</td>
                  <td className="py-2 text-right text-gray-700">₹{l.unit_price}</td>
                  <td className="py-2 text-right font-medium text-gray-900">₹{l.ordered_amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end border-t border-dashed border-gray-200 pt-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900">₹{Number(po.total_amount).toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>

        {po.comparison && (
          <div className="grid grid-cols-3 gap-4 border-t border-dashed border-gray-200 bg-gray-50 px-8 py-5 text-center text-sm">
            <div>
              <p className="text-gray-400">On-time</p>
              <p className="font-semibold capitalize text-gray-900">{po.comparison.on_time_flag.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-gray-400">Fill %</p>
              <p className="font-semibold text-gray-900">{Number(po.comparison.fill_pct).toFixed(1)}% ({po.comparison.fill_flag})</p>
            </div>
            <div>
              <p className="text-gray-400">Price variance</p>
              <p className="font-semibold text-gray-900">{po.comparison.price_variance_pct ? `${Number(po.comparison.price_variance_pct).toFixed(1)}%` : "N/A"}</p>
            </div>
          </div>
        )}
      </div>

      <WhatsAppSendCard
        previewUrl={`/purchase-orders/${id}/wa-preview`}
        sendUrl={`/purchase-orders/${id}/send`}
        sentLabel={po.sent_at ? `Last sent ${new Date(po.sent_at).toISOString().slice(0, 10)}` : undefined}
        actionLabel={po.status === "draft" ? "Send on WhatsApp" : "Resend on WhatsApp"}
        initialPreview={po.waPreview}
      />
    </div>
  );
}
