import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface Grn {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  received_date: string | null;
  ocr_status: string;
  file_url: string;
  branch_name: string;
  vendor_name: string | null;
  po_number: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  parsed: "bg-blue-100 text-blue-700",
  needs_review: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
};

export function GRNList() {
  const { branches } = useAuth();
  const [grns, setGrns] = useState<Grn[]>([]);
  const [branchId, setBranchId] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/grns", { params: { branchId } })
      .then((res) => setGrns(res.data))
      .finally(() => setLoading(false));
  }, [branchId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">GRNs / Invoices</h1>
        <Link to="/grns/upload" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
          + Upload GRN
        </Link>
      </div>

      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
        <option value="all">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
              <th className="px-5 py-2 font-medium">Invoice #</th>
              <th className="px-5 py-2 font-medium">Branch</th>
              <th className="px-5 py-2 font-medium">Vendor</th>
              <th className="px-5 py-2 font-medium">Linked PO</th>
              <th className="px-5 py-2 font-medium">Received date</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {!loading && grns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-gray-400">No GRNs uploaded yet.</td>
              </tr>
            )}
            {grns.map((g) => (
              <tr key={g.id} className="border-b border-gray-50">
                <td className="px-5 py-2">
                  <Link to={`/grns/${g.id}`} className="font-medium text-brand hover:underline">{g.invoice_number ?? "(no invoice #)"}</Link>
                </td>
                <td className="px-5 py-2">{g.branch_name}</td>
                <td className="px-5 py-2">{g.vendor_name ?? "-"}</td>
                <td className="px-5 py-2">{g.po_number ?? "Off-PO"}</td>
                <td className="px-5 py-2">{g.received_date?.slice(0, 10) ?? "-"}</td>
                <td className="px-5 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[g.ocr_status] ?? ""}`}>
                    {g.ocr_status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
