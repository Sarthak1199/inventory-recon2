import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { SkeletonTable } from "../components/Skeleton";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";

interface PO {
  id: string;
  po_number: string;
  status: string;
  created_at: string;
  expected_delivery_date: string | null;
  total_amount: string;
  vendor_name: string;
  branch_name: string;
}

interface Vendor {
  id: string;
  name: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-500",
};

export function POList() {
  const { branches } = useAuth();
  const [pos, setPos] = useState<PO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [status, setStatus] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { branchId };
    if (status) params.status = status;
    if (vendorId) params.vendorId = vendorId;
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;
    setLoading(true);
    api
      .get("/purchase-orders", { params })
      .then((res) => setPos(res.data))
      .finally(() => setLoading(false));
  }, [status, vendorId, branchId, dateRange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Purchase Orders</h1>
        <Link to="/purchase-orders/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
          + New PO
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="filter-select rounded-md border border-gray-300 py-1.5 pl-3 text-sm">
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="filter-select rounded-md border border-gray-300 py-1.5 pl-3 text-sm">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_received">Partially received</option>
          <option value="received">Received</option>
          <option value="closed">Closed</option>
        </select>
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="filter-select rounded-md border border-gray-300 py-1.5 pl-3 text-sm">
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
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                <th className="px-5 py-2 font-medium">PO #</th>
                <th className="px-5 py-2 font-medium">Branch</th>
                <th className="px-5 py-2 font-medium">Vendor</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Created</th>
                <th className="px-5 py-2 font-medium">Expected delivery</th>
                <th className="px-5 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {pos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-gray-400">No purchase orders yet.</td>
                </tr>
              )}
              {pos.map((po) => (
                <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2">
                    <Link to={`/purchase-orders/${po.id}`} className="font-medium text-brand">{po.po_number}</Link>
                  </td>
                  <td className="px-5 py-2">{po.branch_name}</td>
                  <td className="px-5 py-2">{po.vendor_name}</td>
                  <td className="px-5 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[po.status] ?? ""}`}>
                      {po.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-2">{po.created_at?.slice(0, 10) ?? "-"}</td>
                  <td className="px-5 py-2">{po.expected_delivery_date?.slice(0, 10) ?? "-"}</td>
                  <td className="px-5 py-2">₹{Number(po.total_amount).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
