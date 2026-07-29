import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface Vendor {
  id: string;
  name: string;
  whatsapp_number: string | null;
  gstin: string | null;
}

interface Item {
  id: string;
  name: string;
  unit: string;
  category: string | null;
}

export function Settings() {
  const { account, refresh } = useAuth();

  const [brandName, setBrandName] = useState(account?.brand_name ?? "");
  const [hexColor, setHexColor] = useState(account?.brand_hex_color ?? "#4F46E5");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [vendorForm, setVendorForm] = useState({ name: "", whatsapp_number: "", gstin: "" });
  const [itemForm, setItemForm] = useState({ name: "", unit: "", category: "" });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setBrandName(account?.brand_name ?? "");
    setHexColor(account?.brand_hex_color ?? "#4F46E5");
  }, [account]);

  function loadVendors() {
    api.get("/vendors").then((res) => setVendors(res.data));
  }
  function loadItems() {
    api.get("/items").then((res) => setItems(res.data));
  }
  useEffect(() => {
    loadVendors();
    loadItems();
  }, []);

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

  async function addVendor(e: FormEvent) {
    e.preventDefault();
    if (!vendorForm.name.trim()) return;
    await api.post("/vendors", vendorForm);
    setVendorForm({ name: "", whatsapp_number: "", gstin: "" });
    loadVendors();
    setStatus(`Added vendor "${vendorForm.name}".`);
  }

  async function deleteVendor(id: string) {
    await api.delete(`/vendors/${id}`);
    loadVendors();
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!itemForm.name.trim() || !itemForm.unit.trim()) return;
    await api.post("/items", itemForm);
    setItemForm({ name: "", unit: "", category: "" });
    loadItems();
    setStatus(`Added item "${itemForm.name}".`);
  }

  async function deleteItem(id: string) {
    await api.delete(`/items/${id}`);
    loadItems();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your branding, vendors, and item master here at any time.</p>
      </div>

      {status && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>}

      <form onSubmit={saveBrand} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Branding</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Brand name</label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Brand color</label>
          <input type="color" value={hexColor} onChange={(e) => setHexColor(e.target.value)} className="h-9 w-14" />
          <span className="text-sm text-gray-500">{hexColor}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Logo</label>
          {account?.logo_url && <img src={account.logo_url} alt="Current logo" className="mb-2 h-12 w-12 rounded-full object-cover" />}
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <button type="submit" disabled={savingBrand} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {savingBrand ? "Saving..." : "Save branding"}
        </button>
      </form>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Vendors</h2>
        <form onSubmit={addVendor} className="flex flex-wrap gap-2">
          <input
            placeholder="Vendor name"
            value={vendorForm.name}
            onChange={(e) => setVendorForm((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 min-w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="WhatsApp number"
            value={vendorForm.whatsapp_number}
            onChange={(e) => setVendorForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
            className="w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="GSTIN (optional)"
            value={vendorForm.gstin}
            onChange={(e) => setVendorForm((f) => ({ ...f, gstin: e.target.value }))}
            className="w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {vendors.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No vendors yet.</p>}
          {vendors.map((v) => (
            <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900">{v.name}</span>
                {v.whatsapp_number && <span className="ml-2 text-gray-400">{v.whatsapp_number}</span>}
              </div>
              <button onClick={() => deleteVendor(v.id)} className="text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Item master</h2>
        <form onSubmit={addItem} className="flex flex-wrap gap-2">
          <input
            placeholder="Item name"
            value={itemForm.name}
            onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 min-w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Unit (kg, litre...)"
            value={itemForm.unit}
            onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
            className="w-36 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Category"
            value={itemForm.category}
            onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}
            className="w-36 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {items.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No items yet.</p>}
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900">{it.name}</span>
                <span className="ml-2 text-gray-400">({it.unit}{it.category ? `, ${it.category}` : ""})</span>
              </div>
              <button onClick={() => deleteItem(it.id)} className="text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
