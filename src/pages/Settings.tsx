import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AddVendorModal } from "../components/AddVendorModal";

interface Vendor {
  id: string;
  name: string;
  whatsapp_number: string | null;
  gstin: string | null;
  poc_name: string | null;
  poc_number: string | null;
  main_item_name: string | null;
}

interface Item {
  id: string;
  name: string;
  unit: string;
  category: string | null;
}

function downloadFile(url: string, filename: string) {
  api.get(url, { responseType: "blob" }).then((res) => {
    const blobUrl = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  });
}

export function Settings() {
  const { account, refresh } = useAuth();

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", unit: "", category: "" });
  const [itemError, setItemError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [vendorCsv, setVendorCsv] = useState<File | null>(null);
  const [itemCsv, setItemCsv] = useState<File | null>(null);

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

  async function saveLogo(e: FormEvent) {
    e.preventDefault();
    if (!logoFile) return;
    setSavingBrand(true);
    try {
      const formData = new FormData();
      formData.append("logo", logoFile);
      await api.post("/onboarding/setup", formData, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      setLogoFile(null);
      setStatus("Logo updated.");
    } finally {
      setSavingBrand(false);
    }
  }

  async function deleteVendor(id: string) {
    await api.delete(`/vendors/${id}`);
    loadVendors();
  }

  async function uploadVendorCsv() {
    if (!vendorCsv) return;
    const formData = new FormData();
    formData.append("file", vendorCsv);
    const res = await api.post("/vendors/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setStatus(`Imported ${res.data.created.length} vendors, skipped ${res.data.skipped.length}.`);
    setVendorCsv(null);
    loadVendors();
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setItemError(null);
    if (!itemForm.name.trim()) {
      setItemError("Item name is required.");
      return;
    }
    if (!itemForm.unit.trim()) {
      setItemError("Unit is required (e.g. kg, litre).");
      return;
    }
    await api.post("/items", itemForm);
    setItemForm({ name: "", unit: "", category: "" });
    loadItems();
    setStatus(`Added item "${itemForm.name}".`);
  }

  async function deleteItem(id: string) {
    await api.delete(`/items/${id}`);
    loadItems();
  }

  async function uploadItemCsv() {
    if (!itemCsv) return;
    const formData = new FormData();
    formData.append("file", itemCsv);
    const res = await api.post("/items/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    setStatus(`Imported ${res.data.created.length} items, skipped ${res.data.skipped.length}.`);
    setItemCsv(null);
    loadItems();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {showAddVendor && (
        <AddVendorModal
          onClose={() => setShowAddVendor(false)}
          onCreated={() => {
            loadVendors();
            setStatus("Vendor added.");
          }}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your logo, vendors, and item master here at any time.</p>
      </div>

      {status && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>}

      <form onSubmit={saveLogo} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Logo</h2>
        <div className="flex items-center gap-4">
          {account?.logo_url ? (
            <img src={account.logo_url} alt="Current logo" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: account?.brand_hex_color || "#4F46E5" }}
            >
              {(account?.brand_name || account?.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <button type="submit" disabled={!logoFile || savingBrand} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {savingBrand ? "Saving..." : "Save logo"}
        </button>
      </form>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-gray-900">Vendors</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadFile("/vendors/sample-csv", "vendors-sample.csv")} className="text-xs text-brand hover:underline">
              Sample CSV
            </button>
            <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {vendorCsv ? vendorCsv.name : "Upload bulk CSV"}
              <input type="file" accept=".csv" onChange={(e) => setVendorCsv(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
            {vendorCsv && (
              <button onClick={uploadVendorCsv} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
                Import
              </button>
            )}
            <button onClick={() => setShowAddVendor(true)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white">
              + Add vendor
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {vendors.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No vendors yet.</p>}
          {vendors.map((v) => (
            <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900">{v.name}</span>
                {v.whatsapp_number && <span className="ml-2 text-gray-400">{v.whatsapp_number}</span>}
                {v.poc_name && <span className="ml-2 text-gray-400">POC: {v.poc_name}{v.poc_number ? ` (${v.poc_number})` : ""}</span>}
                {v.main_item_name && <span className="ml-2 text-gray-400">Main item: {v.main_item_name}</span>}
              </div>
              <button onClick={() => deleteVendor(v.id)} className="text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-gray-900">Item master</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadFile("/items/sample-csv", "items-sample.csv")} className="text-xs text-brand hover:underline">
              Sample CSV
            </button>
            <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {itemCsv ? itemCsv.name : "Upload bulk CSV"}
              <input type="file" accept=".csv" onChange={(e) => setItemCsv(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
            {itemCsv && (
              <button onClick={uploadItemCsv} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white">
                Import
              </button>
            )}
          </div>
        </div>
        <form onSubmit={addItem} className="flex flex-wrap items-start gap-2">
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
        {itemError && <p className="text-sm text-red-600">{itemError}</p>}
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
