import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

interface Vendor {
  id: string;
  name: string;
  whatsapp_number: string | null;
  gstin?: string | null;
  poc_name?: string | null;
  poc_number?: string | null;
  description?: string | null;
}

export function AddVendorModal({
  onClose,
  onCreated,
  vendor,
}: {
  onClose: () => void;
  onCreated: (vendor: Vendor) => void;
  vendor?: Vendor;
}) {
  const isEdit = !!vendor;
  const [name, setName] = useState(vendor?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(vendor?.whatsapp_number ?? "");
  const [gstin, setGstin] = useState(vendor?.gstin ?? "");
  const [pocName, setPocName] = useState(vendor?.poc_name ?? "");
  const [pocNumber, setPocNumber] = useState(vendor?.poc_number ?? "");
  const [description, setDescription] = useState(vendor?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Vendor name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        whatsapp_number: whatsapp || null,
        gstin: gstin || null,
        poc_name: pocName || null,
        poc_number: pocNumber || null,
        description: description || null,
      };
      const res = isEdit ? await api.put(`/vendors/${vendor!.id}`, payload) : await api.post("/vendors", payload);
      onCreated(res.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? `Failed to ${isEdit ? "update" : "add"} vendor`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{isEdit ? "Edit vendor" : "Add new vendor"}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Vendor name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">WhatsApp number</label>
              <input value={whatsapp ?? ""} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">GSTIN</label>
              <input value={gstin ?? ""} onChange={(e) => setGstin(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">POC name</label>
              <input value={pocName ?? ""} onChange={(e) => setPocName(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">POC number</label>
              <input value={pocNumber ?? ""} onChange={(e) => setPocNumber(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Vendor description</label>
            <textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this vendor supply?"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Add vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
