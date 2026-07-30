import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";
import { SkeletonCard, SkeletonTable } from "../components/Skeleton";

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

interface PriceTrend {
  series: Record<string, string | number>[];
  itemNames: string[];
}

interface Payable {
  vendorId: string;
  vendorName: string;
  poCount: number;
  amountPayable: number;
}

interface Vendor {
  id: string;
  name: string;
}

function fmtPct(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(1)}%`;
}

function fmtRs(v: number) {
  return `Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const PIE_COLORS = ["#4f46e5", "#e11d48", "#f59e0b", "#10b981", "#64748b"];
const LINE_COLORS = ["#4f46e5", "#e11d48", "#f59e0b", "#10b981", "#0ea5e9", "#a855f7", "#64748b"];

function KpiPie({ title, pct, breakdown, tolerancePct }: { title: string; pct: number | null; breakdown: Record<string, number>; tolerancePct?: number }) {
  const data = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: key.replace("_", " "), value }));
  const hasData = data.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{title}{tolerancePct !== undefined ? ` (+/-${tolerancePct}%)` : ""}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900">{fmtPct(pct)}</p>
      <div className="mt-2 h-40">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">No data for this filter</div>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { branches } = useAuth();
  const [branchFilter, setBranchFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [priceImpact, setPriceImpact] = useState<{ rows: PriceImpactRow[]; totalCogs: number } | null>(null);
  const [priceTrend, setPriceTrend] = useState<PriceTrend | null>(null);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter };
    if (vendorFilter) params.vendorId = vendorFilter;
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;

    setLoading(true);
    Promise.all([
      api.get("/dashboard/kpis", { params }),
      api.get("/dashboard/price-impact", { params }),
      api.get("/dashboard/price-trend", { params }),
      api.get("/dashboard/payables", { params }),
    ])
      .then(([kpiRes, priceRes, trendRes, payablesRes]) => {
        setKpis(kpiRes.data);
        setPriceImpact(priceRes.data);
        setPriceTrend(trendRes.data);
        setPayables(payablesRes.data);
      })
      .finally(() => setLoading(false));
  }, [branchFilter, vendorFilter, dateRange]);

  function downloadPayablesCsv() {
    const header = "Vendor,Open POs,Amount Payable\n";
    const body = payables.map((p) => `"${p.vendorName}",${p.poCount},${p.amountPayable.toFixed(2)}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendor-payables.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPayable = payables.reduce((s, p) => s + p.amountPayable, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        kpis && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiPie title="On-Time Delivery" pct={kpis.onTime.pct} breakdown={kpis.onTime.breakdown} />
            <KpiPie title="In-Full Delivery" pct={kpis.inFull.pct} breakdown={kpis.inFull.breakdown} />
            <KpiPie title="Price Accuracy" pct={kpis.priceAccuracy.pct} breakdown={kpis.priceAccuracy.breakdown} tolerancePct={kpis.priceAccuracy.tolerancePct} />
          </div>
        )
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <div>
              <h2 className="font-medium text-gray-900">Price trend</h2>
              <p className="text-xs text-gray-500">Week on week received GRN price per item</p>
            </div>
          </div>
          <div className="h-72 p-4">
            {priceTrend && priceTrend.series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceTrend.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {priceTrend.itemNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} connectNulls dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No confirmed GRN data yet for this filter.</div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <div>
              <h2 className="font-medium text-gray-900">Price Impact</h2>
              <p className="text-xs text-gray-500">Ordered vs received price, sorted by highest cost impact</p>
            </div>
            {priceImpact && <p className="text-sm font-semibold text-gray-900">Total COGS: {fmtRs(priceImpact.totalCogs)}</p>}
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
              {(!priceImpact || priceImpact.rows.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-gray-400">
                    No PO-linked GRN data yet for this filter.
                  </td>
                </tr>
              )}
              {priceImpact?.rows.map((row) => (
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
      )}

      {loading ? (
        <SkeletonTable rows={2} cols={3} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <div>
              <h2 className="font-medium text-gray-900">Vendor payables</h2>
              <p className="text-xs text-gray-500">Money owed per vendor for open purchase orders</p>
            </div>
            <button
              onClick={downloadPayablesCsv}
              disabled={payables.length === 0}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Download as CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                <th className="px-5 py-2 font-medium">Vendor</th>
                <th className="px-5 py-2 font-medium">Open POs</th>
                <th className="px-5 py-2 font-medium">Amount payable</th>
              </tr>
            </thead>
            <tbody>
              {payables.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-sm text-gray-400">
                    No outstanding purchase orders for this filter.
                  </td>
                </tr>
              )}
              {payables.map((p) => (
                <tr key={p.vendorId} className="border-b border-gray-50">
                  <td className="px-5 py-2 font-medium text-gray-900">{p.vendorName}</td>
                  <td className="px-5 py-2">{p.poCount}</td>
                  <td className="px-5 py-2 font-medium">{fmtRs(p.amountPayable)}</td>
                </tr>
              ))}
            </tbody>
            {payables.length > 0 && (
              <tfoot>
                <tr>
                  <td className="px-5 py-2 font-semibold text-gray-900">Total</td>
                  <td className="px-5 py-2"></td>
                  <td className="px-5 py-2 font-semibold text-gray-900">{fmtRs(totalPayable)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
