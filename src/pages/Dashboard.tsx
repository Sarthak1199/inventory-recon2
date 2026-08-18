import { useEffect, useState, type ReactNode } from "react";
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
  BarChart,
  Bar,
} from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";
import { Skeleton, SkeletonCard, SkeletonTable } from "../components/Skeleton";
import { AddBranchModal } from "../components/AddBranchModal";
import { MultiSelectFilter } from "../components/MultiSelectFilter";

interface Kpis {
  onTime: { pct: number | null; breakdown: { early: number; on_time: number; late: number }; count: number };
  inFull: { pct: number | null; breakdown: { full: number; partial: number; not_received: number }; count: number };
  priceAccuracy: { pct: number | null; breakdown: { higher: number; lower: number; same: number }; tolerancePct: number; count: number };
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

interface PayableInvoice {
  vendorName: string;
  poNumber: string;
  createdAt: string;
  status: string;
  itemName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  lineAmount: number;
}

interface Vendor {
  id: string;
  name: string;
}

interface SkuItem {
  skuKey: string;
  itemName: string;
  unit: string | null;
  vendorId: string | null;
  vendorName: string;
  occurrences: number;
  totalQty: number;
}

function fmtPct(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(1)}%`;
}

function fmtRs(v: number) {
  return `Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const PIE_COLORS = ["#4f46e5", "#e11d48", "#f59e0b", "#10b981", "#64748b"];
const LINE_COLORS = ["#4f46e5", "#e11d48", "#f59e0b", "#10b981", "#0ea5e9", "#a855f7", "#64748b"];

function KpiPie({
  title,
  pct,
  breakdown,
  tolerancePct,
  count,
  countUnit = "invoice",
  icon,
}: {
  title: string;
  pct: number | null;
  breakdown: Record<string, number>;
  tolerancePct?: number;
  count: number;
  countUnit?: string;
  icon: ReactNode;
}) {
  const data = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: key.replace("_", " "), value }));
  const hasData = data.length > 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700">{icon}</div>
        {tolerancePct !== undefined && (
          <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">+/-{tolerancePct}%</span>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{fmtPct(pct)}</p>
      <p className="mt-0.5 text-xs text-gray-400">Based on {count} {count === 1 ? countUnit : `${countUnit}s`}</p>
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
  const { branches, refresh } = useAuth();
  const { showToast } = useToast();
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [priceImpact, setPriceImpact] = useState<{ rows: PriceImpactRow[]; totalCogs: number } | null>(null);
  const [priceTrend, setPriceTrend] = useState<PriceTrend | null>(null);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payableInvoices, setPayableInvoices] = useState<PayableInvoice[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [loading, setLoading] = useState(true);

  const [skuVendorFilter, setSkuVendorFilter] = useState("");
  const [skuUniqueCount, setSkuUniqueCount] = useState(0);
  const [skuItems, setSkuItems] = useState<SkuItem[]>([]);
  const [skuLoading, setSkuLoading] = useState(true);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter.length ? branchFilter.join(",") : "all" };
    if (vendorFilter.length) params.vendorId = vendorFilter.join(",");
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
        setPayables(payablesRes.data.rows);
        setPayableInvoices(payablesRes.data.invoices);
        setTotalSpend(payablesRes.data.totalSpend);
      })
      .finally(() => setLoading(false));
  }, [branchFilter, vendorFilter, dateRange]);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter.length ? branchFilter.join(",") : "all" };
    if (skuVendorFilter) params.vendorId = skuVendorFilter;
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;

    setSkuLoading(true);
    api
      .get("/dashboard/sku-counts", { params })
      .then((res) => {
        setSkuUniqueCount(res.data.uniqueSkuCount);
        setSkuItems(res.data.items);
      })
      .finally(() => setSkuLoading(false));
  }, [branchFilter, skuVendorFilter, dateRange]);

  function downloadPayablesCsv() {
    const header = "Vendor,PO Number,Created,Status,Item,Qty,Unit,Unit Price,Line Amount\n";
    const body = payableInvoices
      .map(
        (r) =>
          `"${r.vendorName}","${r.poNumber}",${r.createdAt?.slice(0, 10)},${r.status},"${r.itemName}",${r.qty},${r.unit},${r.unitPrice.toFixed(2)},${r.lineAmount.toFixed(2)}`
      )
      .join("\n");
    const footer = `\n"Total spend",,,,,,,,${totalSpend.toFixed(2)}`;
    const blob = new Blob([header + body + footer], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendor-payables.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {showAddBranch && (
        <AddBranchModal
          onClose={() => setShowAddBranch(false)}
          onCreated={async (b) => {
            await refresh();
            setBranchFilter([b.id]);
            showToast(`Branch "${b.name}" added.`);
          }}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back. Here is the overview of your procurement operations.</p>
        </div>
        <button
          onClick={() => setShowAddBranch(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add branch
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Branches"
          options={branches.map((b) => ({ id: b.id, label: b.name }))}
          selected={branchFilter}
          onChange={setBranchFilter}
        />
        <MultiSelectFilter
          label="Vendors"
          options={vendors.map((v) => ({ id: v.id, label: v.name }))}
          selected={vendorFilter}
          onChange={setVendorFilter}
        />
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <p className="text-xs text-gray-400">
        On-Time Delivery, In-Full Delivery, and Price Accuracy compare PO-linked GRNs against what was ordered, so off-PO receipts aren't included here — see "Items received" below for those.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        kpis && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiPie
              title="On-Time Delivery"
              pct={kpis.onTime.pct}
              breakdown={kpis.onTime.breakdown}
              count={kpis.onTime.count}
              countUnit="purchase order"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
                </svg>
              }
            />
            <KpiPie
              title="In-Full Delivery"
              pct={kpis.inFull.pct}
              breakdown={kpis.inFull.breakdown}
              count={kpis.inFull.count}
              countUnit="purchase order"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7L9 18l-5-5" />
                </svg>
              }
            />
            <KpiPie
              title="Price Accuracy"
              pct={kpis.priceAccuracy.pct}
              breakdown={kpis.priceAccuracy.breakdown}
              tolerancePct={kpis.priceAccuracy.tolerancePct}
              count={kpis.priceAccuracy.count}
              countUnit="line item"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 14l4-4 3 3 5-6" />
                </svg>
              }
            />
          </div>
        )
      )}

      {loading ? (
        <SkeletonTable rows={2} cols={3} />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Vendor payables</h2>
              <p className="text-xs text-gray-500">Money owed per vendor for open purchase orders, highest first</p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm font-semibold text-gray-900">Total spend: {fmtRs(totalSpend)}</p>
              <button
                onClick={downloadPayablesCsv}
                disabled={payableInvoices.length === 0}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Download as CSV
              </button>
            </div>
          </div>
          <div className="h-72 p-4">
            {payables.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payables} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtRs(v)} />
                  <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 12 }} width={140} />
                  <Tooltip formatter={(v: number) => fmtRs(v)} />
                  <Bar dataKey="amountPayable" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No outstanding purchase orders for this filter.</div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Price trend</h2>
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
        <div className="rounded-2xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Price Impact</h2>
              <p className="text-xs text-gray-500">Ordered vs received price for PO-linked items only, sorted by highest cost impact. See "Items received" below for off-PO items.</p>
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

      <div className="rounded-2xl border border-gray-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Items received</h2>
            <p className="text-xs text-gray-500">Unique SKUs received per vendor for this period, including off-PO items</p>
          </div>
          <select
            value={skuVendorFilter}
            onChange={(e) => setSkuVendorFilter(e.target.value)}
            className="filter-select rounded-lg border border-gray-200 py-1.5 pl-3 text-sm"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {skuLoading ? (
          <div className="p-5">
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-8 px-5 py-4">
              <div>
                <p className="text-sm text-gray-500">Unique SKUs</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{skuUniqueCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Receiving line entries</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {skuItems.reduce((s, i) => s + i.occurrences, 0)}
                </p>
              </div>
            </div>
            <div className="h-80 p-4">
              {skuItems.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={skuItems.slice(0, 15).map((i) => ({
                    ...i,
                    label: skuVendorFilter ? i.itemName : `${i.itemName} (${i.vendorName})`,
                  }))} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={180} />
                    <Tooltip formatter={(v: number, _name, item: any) => [`${v} ${item.payload.unit ?? ""}`.trim(), "Qty received"]} />
                    <Bar dataKey="totalQty" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">No confirmed GRN data yet for this filter.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
