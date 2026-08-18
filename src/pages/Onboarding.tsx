import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Onboarding() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();

  const [brandName, setBrandName] = useState(account?.brand_name ?? "");
  const [hexColor, setHexColor] = useState(account?.brand_hex_color ?? "#4F46E5");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  const [itemCsv, setItemCsv] = useState<File | null>(null);
  const [vendorCsv, setVendorCsv] = useState<File | null>(null);
  const [itemManual, setItemManual] = useState({ name: "", unit: "", category: "" });
  const [vendorManual, setVendorManual] = useState({ name: "", whatsapp_number: "", gstin: "" });
  const [status, setStatus] = useState<string | null>(null);

  async function saveBrand(e: FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    try {
      const formData = new FormData();
      formData.append("brand_name", brandName);
      formData.append("brand_hex_color", hexColor);
      if (logoFile) formData.append("logo", logoFile);
      await api.post("/onboarding/setup", formData, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      setStatus("Brand settings saved.");
    } finally {
      setSavingBrand(false);
    }
  }

  async function uploadItemCsv() {
    if (!itemCsv) return;
    const formData = new FormData();
    formData.append("file", itemCsv);
    const res = await api.post("/items/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setStatus(`Imported ${res.data.created.length} items, skipped ${res.data.skipped.length}.`);
    setItemCsv(null);
  }

  async function uploadVendorCsv() {
    if (!vendorCsv) return;
    const formData = new FormData();
    formData.append("file", vendorCsv);
    const res = await api.post("/vendors/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setStatus(`Imported ${res.data.created.length} vendors, skipped ${res.data.skipped.length}.`);
    setVendorCsv(null);
  }

  async function addItemManual(e: FormEvent) {
    e.preventDefault();
    if (!itemManual.name || !itemManual.unit) return;
    await api.post("/items", itemManual);
    setItemManual({ name: "", unit: "", category: "" });
    setStatus(`Added item "${itemManual.name}".`);
  }

  async function addVendorManual(e: FormEvent) {
    e.preventDefault();
    if (!vendorManual.name) return;
    await api.post("/vendors", vendorManual);
    setVendorManual({ name: "", whatsapp_number: "", gstin: "" });
    setStatus(`Added vendor "${vendorManual.name}".`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Set up your workspace</h1>
        <p className="text-sm text-gray-500">Branding, items, and vendors. You can always add more later from Settings.</p>
      </div>

      {status && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>}

      <form onSubmit={saveBrand} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Branding</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Brand name</label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Brand color</label>
          <input type="color" value={hexColor} onChange={(e) => setHexColor(e.target.value)} className="h-9 w-14" />
          <span className="text-sm text-gray-500">{hexColor}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Logo</label>
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <button
          type="submit"
          disabled={savingBrand}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {savingBrand ? "Saving..." : "Save branding"}
        </button>
      </form>

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Items (optional)</h2>
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv" onChange={(e) => setItemCsv(e.target.files?.[0] ?? null)} className="text-sm" />
          <button onClick={uploadItemCsv} disabled={!itemCsv} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50">
            Upload CSV
          </button>
        </div>
        <p className="text-xs text-gray-500">CSV columns: name, unit, category</p>
        <form onSubmit={addItemManual} className="flex flex-wrap gap-2">
          <input
            placeholder="Item name"
            value={itemManual.name}
            onChange={(e) => setItemManual((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 min-w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Unit (kg, litre...)"
            value={itemManual.unit}
            onChange={(e) => setItemManual((f) => ({ ...f, unit: e.target.value }))}
            className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Category"
            value={itemManual.category}
            onChange={(e) => setItemManual((f) => ({ ...f, category: e.target.value }))}
            className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Vendors (optional)</h2>
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv" onChange={(e) => setVendorCsv(e.target.files?.[0] ?? null)} className="text-sm" />
          <button onClick={uploadVendorCsv} disabled={!vendorCsv} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50">
            Upload CSV
          </button>
        </div>
        <p className="text-xs text-gray-500">CSV columns: name, whatsapp_number, gstin</p>
        <form onSubmit={addVendorManual} className="flex flex-wrap gap-2">
          <input
            placeholder="Vendor name"
            value={vendorManual.name}
            onChange={(e) => setVendorManual((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 min-w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="WhatsApp number"
            value={vendorManual.whatsapp_number}
            onChange={(e) => setVendorManual((f) => ({ ...f, whatsapp_number: e.target.value }))}
            className="w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="GSTIN (optional)"
            value={vendorManual.gstin}
            onChange={(e) => setVendorManual((f) => ({ ...f, gstin: e.target.value }))}
            className="w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
      </div>

      <button onClick={() => navigate("/")} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white">
        Go to dashboard
      </button>
    </div>
  );
}
