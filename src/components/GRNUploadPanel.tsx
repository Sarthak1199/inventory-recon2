import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { AddVendorModal } from "./AddVendorModal";

const MAX_FILE_SIZE_MB = 10;

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
  hsnCode: string | null;
  cgstPct: number | null;
  sgstPct: number | null;
  matchedItemId: string | null;
  matchedItemName: string | null;
  matchType: "exact" | "fuzzy" | "none";
  resolvedItemId?: string;
}

function fmtRs(v: number) {
  return `Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function GRNUploadPanel({
  onClose,
  onSaved,
  editGrnId,
}: {
  onClose: () => void;
  onSaved: () => void;
  editGrnId?: string;
}) {
  const { activeBranchId, branches } = useAuth();
  const { showToast } = useToast();

  const [branchId, setBranchId] = useState(activeBranchId ?? "");
  const [poBranchId, setPoBranchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!editGrnId);

  const [grnId, setGrnId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [poId, setPoId] = useState("");
  const [reviewLines, setReviewLines] = useState<ExtractedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);

  useEffect(() => {
    if (!branchId && activeBranchId) setBranchId(activeBranchId);
  }, [activeBranchId, branchId]);

  useEffect(() => {
    if (!editGrnId) return;
    api
      .get(`/grns/${editGrnId}`)
      .then((res) => {
        const g = res.data;
        setGrnId(g.id);
        setFileUrl(g.file_url);
        setInvoiceNumber(g.invoice_number ?? "");
        setInvoiceDate(g.invoice_date?.slice(0, 10) ?? "");
        setReceivedDate(g.received_date?.slice(0, 10) ?? "");
        setVendorId(g.vendor_id ?? "");
        setPoId(g.po_id ?? "");
        setPoBranchId(g.branch_id ?? "");
        setReviewLines(
          g.lines.map((l: any) => ({
            itemName: l.item_name ?? l.raw_item_name ?? "",
            qty: Number(l.received_qty),
            unitPrice: Number(l.unit_price),
            amount: Number(l.received_amount),
            hsnCode: l.hsn_code ?? null,
            cgstPct: l.cgst_pct != null ? Number(l.cgst_pct) : null,
            sgstPct: l.sgst_pct != null ? Number(l.sgst_pct) : null,
            matchedItemId: l.item_id ?? null,
            matchedItemName: l.item_name ?? null,
            matchType: l.match_type ?? "none",
          }))
        );
      })
      .finally(() => setLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editGrnId]);

  useEffect(() => {
    const effectiveBranchId = editGrnId ? poBranchId : branchId;
    if (!effectiveBranchId) return;
    api.get("/purchase-orders", { params: { branchId: effectiveBranchId } }).then((res) =>
      setOpenPos(res.data.filter((p: any) => p.status === "sent" || p.status === "partially_received"))
    );
  }, [branchId, poBranchId, editGrnId]);

  useEffect(() => {
    api.get("/vendors").then((res) => setVendors(res.data));
    api.get("/items").then((res) => setItems(res.data));
  }, []);

  function handleFileSelect(f: File | null) {
    setError(null);
    if (f && f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    if (!branchId) {
      setError("Select a branch.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("branchId", branchId);

      const res = await api.post("/grns/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setGrnId(res.data.grnId);
      setFileUrl(res.data.fileUrl);
      setInvoiceNumber(res.data.extracted.invoice_number ?? "");
      setInvoiceDate(res.data.extracted.invoice_date ?? "");
      setReviewLines(res.data.extracted.lines);
      if (res.data.suggestedPo) {
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
    setReviewLines((prev) => [
      ...prev,
      { itemName: "", qty: 0, unitPrice: 0, amount: 0, hsnCode: null, cgstPct: null, sgstPct: null, matchedItemId: null, matchedItemName: null, matchType: "none" },
    ]);
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
          hsnCode: l.hsnCode || null,
          cgstPct: l.cgstPct,
          sgstPct: l.sgstPct,
        })),
      });
      showToast(editGrnId ? "GRN updated." : "GRN saved.");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to save GRN");
      showToast("Failed to save GRN.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-xl">
        {showAddVendor && (
          <AddVendorModal
            onClose={() => setShowAddVendor(false)}
            onCreated={(v) => {
              setVendors((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
              setVendorId(v.id);
            }}
          />
        )}

        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">{editGrnId ? "Edit GRN / Invoice" : "Upload GRN / Invoice"}</h1>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loadingExisting ? (
          <div className="flex-1 p-6">
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : !grnId ? (
          <div className="flex-1 space-y-4 p-6">
            {uploading ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-brand/40 bg-brand/5 px-4 py-16 text-center">
                <svg className="h-8 w-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <p className="text-sm font-medium text-brand">Scanning invoice...</p>
                <p className="text-xs text-gray-500">Reading line items, prices, and vendor details</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <label className="mb-1 block text-sm font-medium text-gray-700">File (image or PDF)</label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-brand/40 bg-brand/5 px-4 py-10 text-sm font-medium text-brand transition hover:border-brand hover:bg-brand/10">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {file ? file.name : "Choose file to upload"}
                  <input type="file" accept="image/*,.pdf" onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} className="hidden" />
                </label>
                <p className="mt-1.5 text-xs text-gray-400">1 file per upload · JPG, PNG, or PDF · max {MAX_FILE_SIZE_MB}MB</p>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!uploading && (
              <button onClick={handleUpload} disabled={!file || uploading} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                Upload & Extract
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-4 p-6">
            <div className="rounded-lg border border-gray-200 p-3">
              {fileUrl?.endsWith(".pdf") ? (
                <embed src={fileUrl} className="h-64 w-full" />
              ) : (
                <img src={fileUrl ?? ""} alt="GRN source" className="max-h-64 w-full rounded-md border border-gray-100 object-contain" />
              )}
            </div>

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
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="text-left uppercase text-gray-400">
                    <th className="py-1">Name (as printed)</th>
                    <th className="py-1">HSN</th>
                    <th className="py-1">Qty</th>
                    <th className="py-1">Price</th>
                    <th className="py-1">CGST%</th>
                    <th className="py-1">SGST%</th>
                    <th className="py-1">Matched item</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLines.map((line, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1">
                        <input value={line.itemName} onChange={(e) => updateLine(i, { itemName: e.target.value })} className="w-24 rounded border border-gray-200 px-1 py-0.5" />
                      </td>
                      <td className="py-1">
                        <input value={line.hsnCode ?? ""} onChange={(e) => updateLine(i, { hsnCode: e.target.value || null })} className="w-16 rounded border border-gray-200 px-1 py-0.5" />
                      </td>
                      <td className="py-1">
                        <input type="number" value={line.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} className="w-14 rounded border border-gray-200 px-1 py-0.5" />
                      </td>
                      <td className="py-1">
                        <input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} className="w-14 rounded border border-gray-200 px-1 py-0.5" />
                      </td>
                      <td className="py-1">
                        <input
                          type="number"
                          value={line.cgstPct ?? ""}
                          onChange={(e) => updateLine(i, { cgstPct: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-12 rounded border border-gray-200 px-1 py-0.5"
                        />
                      </td>
                      <td className="py-1">
                        <input
                          type="number"
                          value={line.sgstPct ?? ""}
                          onChange={(e) => updateLine(i, { sgstPct: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-12 rounded border border-gray-200 px-1 py-0.5"
                        />
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
            </div>

            {(() => {
              const subtotal = reviewLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
              const totalCgst = reviewLines.reduce((s, l) => s + (l.qty * l.unitPrice * (l.cgstPct ?? 0)) / 100, 0);
              const totalSgst = reviewLines.reduce((s, l) => s + (l.qty * l.unitPrice * (l.sgstPct ?? 0)) / 100, 0);
              const totalGst = totalCgst + totalSgst;
              const billTotal = subtotal + totalGst;
              return (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                  <div className="grid grid-cols-2 gap-y-1 text-gray-600 sm:grid-cols-5">
                    <div>Subtotal: <span className="font-medium text-gray-900">{fmtRs(subtotal)}</span></div>
                    <div>CGST: <span className="font-medium text-gray-900">{fmtRs(totalCgst)}</span></div>
                    <div>SGST: <span className="font-medium text-gray-900">{fmtRs(totalSgst)}</span></div>
                    <div>Total GST: <span className="font-medium text-gray-900">{fmtRs(totalGst)}</span></div>
                    <div>Bill total: <span className="font-semibold text-gray-900">{fmtRs(billTotal)}</span></div>
                  </div>
                </div>
              );
            })()}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={handleConfirm} disabled={saving} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : editGrnId ? "Save Changes" : "Confirm GRN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
