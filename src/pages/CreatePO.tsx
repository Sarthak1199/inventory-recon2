import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { AddVendorModal } from "../components/AddVendorModal";

interface Vendor {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
  unit: string;
  category: string | null;
}

interface Line {
  itemId: string;
  itemName: string;
  unit: string;
  orderedQty: number;
  unitPrice: number;
}

interface CsvRow {
  rowIndex: number;
  itemName: string;
  qty: number;
  unitPrice: number;
  matchedItem: Item | null;
  matchType: "exact" | "fuzzy" | "none";
  score: number | null;
  resolvedItemId?: string;
}

function downloadSampleCsv() {
  api.get("/purchase-orders/sample-csv", { responseType: "blob" }).then((res) => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "po-lines-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function CreatePO() {
  const { id } = useParams();
  const isEdit = !!id;
  const { activeBranchId, branches } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [branchId, setBranchId] = useState(activeBranchId ?? "");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  const [itemSearch, setItemSearch] = useState("");
  const [manualItemId, setManualItemId] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
    api.get("/items").then((res) => setItems(res.data));
  }, []);

  useEffect(() => {
    if (!branchId && activeBranchId) setBranchId(activeBranchId);
  }, [activeBranchId, branchId]);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/purchase-orders/${id}`)
      .then((res) => {
        const po = res.data;
        setBranchId(po.branch_id);
        setVendorId(po.vendor_id);
        setExpectedDeliveryDate(po.expected_delivery_date?.slice(0, 10) ?? "");
        setLines(
          po.lines.map((l: any) => ({
            itemId: l.item_id,
            itemName: l.item_name,
            unit: l.unit,
            orderedQty: Number(l.ordered_qty),
            unitPrice: Number(l.unit_price),
          }))
        );
      })
      .finally(() => setLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const filteredItems = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(itemSearch.toLowerCase())),
    [items, itemSearch]
  );

  const total = lines.reduce((s, l) => s + l.orderedQty * l.unitPrice, 0);

  function itemLabel(i: Item) {
    return `${i.name} (${i.unit}${i.category ? `, ${i.category}` : ""})`;
  }

  function addManualLine() {
    const item = items.find((i) => i.id === manualItemId);
    const qty = Number(manualQty);
    const price = Number(manualPrice);
    if (!item || !qty || !price) return;
    setLines((prev) => [...prev, { itemId: item.id, itemName: item.name, unit: item.unit, orderedQty: qty, unitPrice: price }]);
    setManualItemId("");
    setManualQty("");
    setManualPrice("");
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function previewCsv() {
    if (!csvFile) return;
    const formData = new FormData();
    formData.append("file", csvFile);
    const res = await api.post("/purchase-orders/parse-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setCsvRows(res.data.rows);
  }

  function setCsvRowResolution(rowIndex: number, itemId: string) {
    setCsvRows((prev) => prev?.map((r) => (r.rowIndex === rowIndex ? { ...r, resolvedItemId: itemId } : r)) ?? null);
  }

  function addCsvRowsToLines() {
    if (!csvRows) return;
    const newLines: Line[] = [];
    for (const row of csvRows) {
      const itemId = row.resolvedItemId || row.matchedItem?.id;
      if (!itemId) continue;
      const item = items.find((i) => i.id === itemId);
      if (!item) continue;
      newLines.push({ itemId, itemName: item.name, unit: item.unit, orderedQty: row.qty, unitPrice: row.unitPrice });
    }
    setLines((prev) => [...prev, ...newLines]);
    setCsvRows(null);
    setCsvFile(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!branchId) return setError("Select a branch.");
    if (!vendorId) return setError("Select a vendor.");
    if (lines.length === 0) return setError("Add at least one line item.");

    setSubmitting(true);
    try {
      const linePayload = lines.map((l) => ({ itemId: l.itemId, orderedQty: l.orderedQty, unitPrice: l.unitPrice }));
      if (isEdit) {
        await api.put(`/purchase-orders/${id}`, {
          vendorId,
          expectedDeliveryDate: expectedDeliveryDate || null,
          lines: linePayload,
        });
        showToast("Purchase order updated.");
        navigate(`/purchase-orders/${id}`);
      } else {
        const res = await api.post("/purchase-orders", {
          branchId,
          vendorId,
          expectedDeliveryDate: expectedDeliveryDate || null,
          lines: linePayload,
        });
        showToast(`Purchase order ${res.data.po_number ?? ""} created.`);
        navigate(`/purchase-orders/${res.data.id}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? `Failed to ${isEdit ? "update" : "create"} PO`);
      showToast(`Failed to ${isEdit ? "update" : "create"} purchase order.`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingExisting) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {showAddVendor && (
        <AddVendorModal
          onClose={() => setShowAddVendor(false)}
          onCreated={(v) => {
            setVendors((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
            setVendorId(v.id);
          }}
        />
      )}
      <h1 className="text-2xl font-bold text-gray-900">{isEdit ? "Edit Purchase Order" : "Create Purchase Order"}</h1>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-white p-6 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={isEdit}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
          <div className="flex gap-2">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAddVendor(true)}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + New
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Expected delivery date</label>
          <input
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Add line items</h2>
        <input
          placeholder="Search item..."
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <select value={manualItemId} onChange={(e) => setManualItemId(e.target.value)} className="flex-1 min-w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
            <option value="">Select item</option>
            {filteredItems.map((i) => (
              <option key={i.id} value={i.id}>{itemLabel(i)}</option>
            ))}
          </select>
          <input placeholder="Qty" type="number" value={manualQty} onChange={(e) => setManualQty(e.target.value)} className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
          <input placeholder="Unit price" type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
          <button onClick={addManualLine} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">Add</button>
        </div>

        <button
          type="button"
          onClick={() => setShowCsvUpload((v) => !v)}
          className="text-xs font-medium text-brand hover:underline"
        >
          {showCsvUpload ? "Hide bulk CSV upload" : "Or upload bulk via CSV"}
        </button>

        {showCsvUpload && (
          <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Columns: item_name, qty, unit_price</p>
              <button onClick={downloadSampleCsv} className="text-xs text-brand hover:underline">Download sample CSV</button>
            </div>
            <div className="flex items-center gap-2">
              <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="text-sm" />
              <button onClick={previewCsv} disabled={!csvFile} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
                Preview
              </button>
            </div>

            {csvRows && (
              <div className="space-y-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-400">
                      <th className="py-1">Row item name</th>
                      <th className="py-1">Qty</th>
                      <th className="py-1">Price</th>
                      <th className="py-1">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row) => (
                      <tr key={row.rowIndex} className="border-t border-gray-100">
                        <td className="py-1">{row.itemName}</td>
                        <td className="py-1">{row.qty}</td>
                        <td className="py-1">{row.unitPrice}</td>
                        <td className="py-1">
                          {row.matchedItem ? (
                            <span className={row.matchType === "exact" ? "text-green-600" : "text-amber-600"}>
                              {row.matchedItem.name} ({row.matchType})
                            </span>
                          ) : (
                            <select
                              value={row.resolvedItemId ?? ""}
                              onChange={(e) => setCsvRowResolution(row.rowIndex, e.target.value)}
                              className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="">Map to item...</option>
                              {items.map((i) => (
                                <option key={i.id} value={i.id}>{itemLabel(i)}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={addCsvRowsToLines} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">
                  Add resolved rows to PO
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="mb-3 font-medium text-gray-900">Line items ({lines.length})</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-gray-400">No lines added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400">
                <th className="py-1">Item</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Unit price</th>
                <th className="py-1">Amount</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1">{l.itemName} <span className="text-gray-400">({l.unit})</span></td>
                  <td className="py-1">{l.orderedQty}</td>
                  <td className="py-1">₹{l.unitPrice}</td>
                  <td className="py-1">₹{(l.orderedQty * l.unitPrice).toFixed(2)}</td>
                  <td className="py-1">
                    <button onClick={() => removeLine(i)} className="text-xs text-red-500">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-right text-sm font-semibold text-gray-900">Total: ₹{total.toFixed(2)}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={handleSubmit} disabled={submitting} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {submitting ? "Saving..." : isEdit ? "Save Changes" : "Save Purchase Order"}
      </button>
    </div>
  );
}
