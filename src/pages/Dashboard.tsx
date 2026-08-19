import { useEffect, useState, type ReactNode } from "react";
import {
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
import { Skeleton, SkeletonTable } from "../components/Skeleton";
import { AddBranchModal } from "../components/AddBranchModal";
import { MultiSelectFilter } from "../components/MultiSelectFilter";

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

interface GrnOption {
  id: string;
  label: string;
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

function fmtRs(v: number) {
  return `Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const LINE_COLORS = ["#4f46e5", "#e11d48", "#f59e0b", "#10b981", "#0ea5e9", "#a855f7", "#64748b"];

function KpiPlaceholder({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700">{icon}</div>
      <p className="mt-3 text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-gray-400">Coming soon</p>
      <p className="mt-2 text-xs text-gray-400">Needs vendor records to recon against — not yet available.</p>
    </div>
  );
}

export function Dashboard() {
  const { branches, refresh } = useAuth();
  const { showToast } = useToast();
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [grnFilter, setGrnFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [grnOptions, setGrnOptions] = useState<GrnOption[]>([]);
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
    api.get("/dashboard/grns").then((res) => setGrnOptions(res.data));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter.length ? branchFilter.join(",") : "all" };
    if (vendorFilter.length) params.vendorId = vendorFilter.join(",");
    if (grnFilter.length) params.grnId = grnFilter.join(",");
    if (dateRange.from) params.dateFrom = dateRange.from;
    if (dateRange.to) params.dateTo = dateRange.to;

    setLoading(true);
    Promise.all([api.get("/dashboard/price-trend", { params }), api.get("/dashboard/payables", { params })])
      .then(([trendRes, payablesRes]) => {
        setPriceTrend(trendRes.data);
        setPayables(payablesRes.data.rows);
        setPayableInvoices(payablesRes.data.invoices);
        setTotalSpend(payablesRes.data.totalSpend);
      })
      .finally(() => setLoading(false));
  }, [branchFilter, vendorFilter, grnFilter, dateRange]);

  useEffect(() => {
    const params: Record<string, string> = { branchId: branchFilter.length ? branchFilter.join(",") : "all" };
    if (skuVendorFilter) params.vendorId = skuVendorFilter;
    if (grnFilter.length) params.grnId = grnFilter.join(",");
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
  }, [branchFilter, skuVendorFilter, grnFilter, dateRange]);

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
          <p className="mt-1 text-sm text-gray-500">GRN-inwarded items, prices, and spend — here is the overview.</p>
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

      <div className="sticky top-0 z-10 -mx-8 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-[#fafafa] px-8 py-3">
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
        <MultiSelectFilter
          label="GRNs"
          options={grnOptions.map((g) => ({ id: g.id, label: g.label }))}
          selected={grnFilter}
          onChange={setGrnFilter}
        />
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

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

      {loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Price trend</h2>
              <p className="text-xs text-gray-500">Week on week received GRN price per SKU</p>
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

      <div>
        <p className="text-xs text-gray-400">
          On-Time Delivery, In-Full Delivery, and Price Accuracy will recon GRNs against vendor records once that data exists.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiPlaceholder
            title="On-Time Delivery"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
              </svg>
            }
          />
          <KpiPlaceholder
            title="In-Full Delivery"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7L9 18l-5-5" />
              </svg>
            }
          />
          <KpiPlaceholder
            title="Price Accuracy"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 14l4-4 3 3 5-6" />
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}
