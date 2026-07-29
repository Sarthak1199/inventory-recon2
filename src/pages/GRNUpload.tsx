import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AddVendorModal } from "../components/AddVendorModal";

interface Vendor {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
  unit: string;
}

interface OpenPo {
  id: string;
  po_number: string;
  vendor_name: string;
  status: string;
}

interface ExtractedLine {
  itemName: string;
  qty: number;
  unitPrice: number;
  amount: number;
  matchedItemId: string | null;
  matchedItemName: string | null;
  matchType: "exact" | "fuzzy" | "none";
  resolvedItemId?: string;
}

export function GRNUpload() {
  const { activeBranchId } = useAuth();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [poId, setPoId] = useState("");
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);

  const [grnId, setGrnId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [reviewLines, setReviewLines] = useState<ExtractedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);

  useEffect(() => {
    api.get("/purchase-orders", { params: { branchId: activeBranchId } }).then((res) =>
      setOpenPos(res.data.filter((p: any) => p.status === "sent" || p.status === "partially_received"))
    );
    api.get("/vendors").then((res) => setVendors(res.data));
    api.get("/items").then((res) => setItems(res.data));
  }, [activeBranchId]);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("branchId", activeBranchId ?? "");
      if (poId) formData.append("poId", poId);

      const res = await api.post("/grns/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setGrnId(res.data.grnId);
      setFileUrl(res.data.fileUrl);
      setInvoiceNumber(res.data.extracted.invoice_number ?? "");
      setInvoiceDate(res.data.extracted.invoice_date ?? "");
      setReviewLines(res.data.extracted.lines);
      if (res.data.suggestedPo && !poId) {
        setPoId(res.data.suggestedPo.poId);
        setVendorId(res.data.suggestedPo.vendorId);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function updateLine(index: number, patch: Partial<ExtractedLine>) {
    setReviewLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addBlankLine() {
    setReviewLines((prev) => [...prev, { itemName: "", qty: 0, unitPrice: 0, amount: 0, matchedItemId: null, matchedItemName: null, matchType: "none" }]);
  }

  function removeLine(index: number) {
    setReviewLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    if (!grnId) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/grns/${grnId}/review`, {
        invoiceNumber,
        invoiceDate: invoiceDate || null,
        receivedDate: receivedDate || null,
        poId: poId || null,
        vendorId: vendorId || null,
        lines: reviewLines.map((l) => ({
          itemName: l.itemName,
          qty: l.qty,
          unitPrice: l.unitPrice,
          itemId: l.resolvedItemId || l.matchedItemId,
          matchType: l.resolvedItemId ? "manual" : l.matchType,
        })),
      });
      navigate("/grns");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to save GRN");
    } finally {
      setSaving(false);
    }
  }

  if (!grnId) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900">Upload GRN / Invoice</h1>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">File (image or PDF)</label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-brand/40 bg-brand/5 px-4 py-6 text-sm font-medium text-brand transition hover:border-brand hover:bg-brand/10">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {file ? file.name : "Choose file to upload"}
            <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Link to PO (optional)</label>
          <select value={poId} onChange={(e) => setPoId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Let system suggest best match</option>
            {openPos.map((p) => (
              <option key={p.id} value={p.id}>{p.po_number} ({p.vendor_name})</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={handleUpload} disabled={!file || uploading} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {uploading ? "Processing..." : "Upload & Extract"}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {showAddVendor && (
        <AddVendorModal
          onClose={() => setShowAddVendor(false)}
          onCreated={(v) => {
            setVendors((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
            setVendorId(v.id);
          }}
        />
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-gray-900">Source document</h2>
        {fileUrl?.endsWith(".pdf") ? (
          <embed src={fileUrl} className="h-[600px] w-full" />
        ) : (
          <img src={fileUrl ?? ""} alt="GRN source" className="w-full rounded-md border border-gray-100" />
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">Review & confirm</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Invoice number</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Received date</label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Vendor</label>
            <div className="flex gap-1">
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddVendor(true)}
                className="shrink-0 rounded-md border border-gray-300 px-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                + New
              </button>
            </div>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-700">Linked PO</label>
            <select value={poId} onChange={(e) => setPoId(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">No PO (off-PO items)</option>
              {openPos.map((p) => (
                <option key={p.id} value={p.id}>{p.po_number} ({p.vendor_name})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Line items</h3>
            <button onClick={addBlankLine} className="text-xs text-brand">+ Add line</button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left uppercase text-gray-400">
                <th className="py-1">Name (as printed)</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Price</th>
                <th className="py-1">Matched item</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {reviewLines.map((line, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1">
                    <input value={line.itemName} onChange={(e) => updateLine(i, { itemName: e.target.value })} className="w-28 rounded border border-gray-200 px-1 py-0.5" />
                  </td>
                  <td className="py-1">
                    <input type="number" value={line.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} className="w-16 rounded border border-gray-200 px-1 py-0.5" />
                  </td>
                  <td className="py-1">
                    <input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} className="w-16 rounded border border-gray-200 px-1 py-0.5" />
                  </td>
                  <td className="py-1">
                    <select
                      value={line.resolvedItemId ?? line.matchedItemId ?? ""}
                      onChange={(e) => updateLine(i, { resolvedItemId: e.target.value })}
                      className="rounded border border-gray-200 px-1 py-0.5"
                    >
                      <option value="">Off-PO / unmatched</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    {line.matchType !== "none" && !line.resolvedItemId && (
                      <span className="ml-1 text-[10px] text-gray-400">({line.matchType})</span>
                    )}
                  </td>
                  <td className="py-1">
                    <button onClick={() => removeLine(i)} className="text-red-500">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={handleConfirm} disabled={saving} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {saving ? "Saving..." : "Confirm GRN"}
        </button>
      </div>
    </div>
  );
}
