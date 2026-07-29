import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

interface Vendor {
  id: string;
  name: string;
  whatsapp_number: string | null;
}

export function AddVendorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (vendor: Vendor) => void;
}) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post("/vendors", { name, whatsapp_number: whatsapp || null });
      onCreated(res.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to add vendor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add new vendor</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Vendor name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">WhatsApp number (optional)</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+91..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Adding..." : "Add vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
