import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { QuestCards } from "../components/QuestCards";

interface Kpis {
  onTime: { pct: number | null; breakdown: { early: number; on_time: number; late: number } };
  inFull: { pct: number | null; breakdown: { full: number; partial: number; not_received: number } };
  priceAccuracy: { pct: number | null; breakdown: { higher: number; lower: number; same: number }; tolerancePct: number };
}

interface PriceImpactRow {
  itemId: string;
  itemName: string;
  unit: string;
  avgOrderedPrice: number;
  avgReceivedPrice: number;
  pctChange: number | null;
  totalReceivedQty: number;
  costImpact: number;
}

interface Vendor {
  id: string;
  name: string;
}

function fmtPct(v: number | null) {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function fmtRs(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function Dashboard() {
  const { branches } = useAuth();
  const [branchFilter, setBranchFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [priceImpact, setPriceImpact] = useState<PriceImpactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter };
    if (vendorFilter) params.vendorId = vendorFilter;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;

    setLoading(true);
    Promise.all([api.get("/dashboard/kpis", { params }), api.get("/dashboard/price-impact", { params })])
      .then(([kpiRes, priceRes]) => {
        setKpis(kpiRes.data);
        setPriceImpact(priceRes.data);
      })
      .finally(() => setLoading(false));
  }, [branchFilter, vendorFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <QuestCards />

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <span className="self-center text-sm text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {kpis && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">On-Time Delivery</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{fmtPct(kpis.onTime.pct)}</p>
            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <span>Early: {kpis.onTime.breakdown.early}</span>
              <span>On-time: {kpis.onTime.breakdown.on_time}</span>
              <span>Late: {kpis.onTime.breakdown.late}</span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">In-Full Delivery</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{fmtPct(kpis.inFull.pct)}</p>
            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <span>Full: {kpis.inFull.breakdown.full}</span>
              <span>Partial: {kpis.inFull.breakdown.partial}</span>
              <span>Not received: {kpis.inFull.breakdown.not_received}</span>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Price Accuracy (±{kpis.priceAccuracy.tolerancePct}%)</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{fmtPct(kpis.priceAccuracy.pct)}</p>
            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <span>Higher: {kpis.priceAccuracy.breakdown.higher}</span>
              <span>Lower: {kpis.priceAccuracy.breakdown.lower}</span>
              <span>Same: {kpis.priceAccuracy.breakdown.same}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3">
          <h2 className="font-medium text-gray-900">Price Impact</h2>
          <p className="text-xs text-gray-500">Ordered vs received price, sorted by highest cost impact</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
              <th className="px-5 py-2 font-medium">Item</th>
              <th className="px-5 py-2 font-medium">Ordered price</th>
              <th className="px-5 py-2 font-medium">Received price</th>
              <th className="px-5 py-2 font-medium">% change</th>
              <th className="px-5 py-2 font-medium">Qty received</th>
              <th className="px-5 py-2 font-medium">Cost impact</th>
            </tr>
          </thead>
          <tbody>
            {priceImpact.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-gray-400">
                  No PO-linked GRN data yet for this filter.
                </td>
              </tr>
            )}
            {priceImpact.map((row) => (
              <tr key={row.itemId} className="border-b border-gray-50">
                <td className="px-5 py-2">{row.itemName} <span className="text-gray-400">({row.unit})</span></td>
                <td className="px-5 py-2">{fmtRs(row.avgOrderedPrice)}</td>
                <td className="px-5 py-2">{fmtRs(row.avgReceivedPrice)}</td>
                <td className={`px-5 py-2 ${row.pctChange && row.pctChange > 0 ? "text-red-600" : row.pctChange && row.pctChange < 0 ? "text-green-600" : ""}`}>
                  {row.pctChange === null ? "N/A" : `${row.pctChange.toFixed(1)}%`}
                </td>
                <td className="px-5 py-2">{row.totalReceivedQty}</td>
                <td className={`px-5 py-2 font-medium ${row.costImpact > 0 ? "text-red-600" : row.costImpact < 0 ? "text-green-600" : "text-gray-700"}`}>
                  {fmtRs(row.costImpact)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
