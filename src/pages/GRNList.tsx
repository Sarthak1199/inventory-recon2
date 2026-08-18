import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { GRNUploadPanel } from "../components/GRNUploadPanel";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";
import { SkeletonTable } from "../components/Skeleton";

interface Grn {
  id: string;
  grn_number: string | null;
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

interface Vendor {
  id: string;
  name: string;
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [branchId, setBranchId] = useState("all");
  const [vendorId, setVendorId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
  }, []);

  function load() {
    const params: Record<string, string> = { branchId };
    if (vendorId) params.vendorId = vendorId;
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;
    setLoading(true);
    api
      .get("/grns", { params })
      .then((res) => setGrns(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [branchId, vendorId, dateRange]);

  return (
    <div className="space-y-4">
      {showUpload && <GRNUploadPanel onClose={() => setShowUpload(false)} onSaved={load} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GRNs / Invoices</h1>
          <p className="mt-1 text-sm text-gray-500">Reconcile what arrived against what was ordered.</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload GRN
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="filter-select rounded-lg border border-gray-200 py-1.5 pl-3 text-sm">
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="filter-select rounded-lg border border-gray-200 py-1.5 pl-3 text-sm">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <DateRangeFilter value={dateRange} onChange={setDateRange} label="Created at" />
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                <th className="px-5 py-2 font-medium">GRN #</th>
                <th className="px-5 py-2 font-medium">Invoice #</th>
                <th className="px-5 py-2 font-medium">Branch</th>
                <th className="px-5 py-2 font-medium">Vendor</th>
                <th className="px-5 py-2 font-medium">Linked PO</th>
                <th className="px-5 py-2 font-medium">Created</th>
                <th className="px-5 py-2 font-medium">Received date</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {grns.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-gray-400">No GRNs uploaded yet.</td>
                </tr>
              )}
              {grns.map((g) => (
                <tr key={g.id} className="border-b border-gray-50">
                  <td className="px-5 py-2">
                    <Link to={`/grns/${g.id}`} className="font-medium text-brand hover:underline">{g.grn_number ?? "-"}</Link>
                  </td>
                  <td className="px-5 py-2">{g.invoice_number ?? "(no invoice #)"}</td>
                  <td className="px-5 py-2">{g.branch_name}</td>
                  <td className="px-5 py-2">{g.vendor_name ?? "-"}</td>
                  <td className="px-5 py-2">{g.po_number ?? "Off-PO"}</td>
                  <td className="px-5 py-2">{g.created_at?.slice(0, 10) ?? "-"}</td>
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
      )}
    </div>
  );
}
