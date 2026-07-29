import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface Vendor {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
  unit: string;
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

export function CreatePO() {
  const { activeBranchId } = useAuth();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [itemSearch, setItemSearch] = useState("");
  const [manualItemId, setManualItemId] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
    api.get("/items").then((res) => setItems(res.data));
  }, []);

  const filteredItems = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(itemSearch.toLowerCase())),
    [items, itemSearch]
  );

  const total = lines.reduce((s, l) => s + l.orderedQty * l.unitPrice, 0);

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
    if (!activeBranchId) return setError("No active branch selected.");
    if (!vendorId) return setError("Select a vendor.");
    if (lines.length === 0) return setError("Add at least one line item.");

    setSubmitting(true);
    try {
      const res = await api.post("/purchase-orders", {
        branchId: activeBranchId,
        vendorId,
        expectedDeliveryDate: expectedDeliveryDate || null,
        lines: lines.map((l) => ({ itemId: l.itemId, orderedQty: l.orderedQty, unitPrice: l.unitPrice })),
      });
      navigate(`/purchase-orders/${res.data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Create Purchase Order</h1>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Expected delivery date</label>
          <input
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Add line items — CSV upload</h2>
        <p className="text-xs text-gray-500">Columns: item_name, qty, unit_price</p>
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <button onClick={previewCsv} disabled={!csvFile} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">
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
                  <tr key={row.rowIndex} className="border-t border-gray-50">
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
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">Map to item...</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addCsvRowsToLines} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white">
              Add resolved rows to PO
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Add line items — manual entry</h2>
        <input
          placeholder="Search item..."
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <select value={manualItemId} onChange={(e) => setManualItemId(e.target.value)} className="flex-1 min-w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">Select item</option>
            {filteredItems.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
            ))}
          </select>
          <input placeholder="Qty" type="number" value={manualQty} onChange={(e) => setManualQty(e.target.value)} className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
          <input placeholder="Unit price" type="number" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
          <button onClick={addManualLine} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white">Add row</button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
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
      <button onClick={handleSubmit} disabled={submitting} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {submitting ? "Saving..." : "Save Purchase Order"}
      </button>
    </div>
  );
}
