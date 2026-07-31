import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { AddVendorModal } from "../components/AddVendorModal";
import { SkeletonTable } from "../components/Skeleton";

interface Vendor {
  id: string;
  name: string;
  whatsapp_number: string | null;
  gstin: string | null;
  poc_name: string | null;
  poc_number: string | null;
  description: string | null;
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
  const { showToast } = useToast();

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [brandName, setBrandName] = useState(account?.brand_name ?? account?.name ?? "");
  const [savingBrand, setSavingBrand] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", unit: "", category: "" });
  const [itemError, setItemError] = useState<string | null>(null);
  const [vendorCsv, setVendorCsv] = useState<File | null>(null);
  const [itemCsv, setItemCsv] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneEditingId, setPhoneEditingId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  function loadVendors() {
    api.get("/vendors").then((res) => setVendors(res.data));
  }
  function loadItems() {
    api.get("/items").then((res) => setItems(res.data));
  }
  useEffect(() => {
    Promise.all([api.get("/vendors"), api.get("/items")])
      .then(([vendorsRes, itemsRes]) => {
        setVendors(vendorsRes.data);
        setItems(itemsRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveBrand(e: FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    try {
      const formData = new FormData();
      if (logoFile) formData.append("logo", logoFile);
      formData.append("brand_name", brandName);
      await api.post("/onboarding/setup", formData, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      setLogoFile(null);
      showToast("Branding updated.");
    } catch {
      showToast("Failed to update branding.", "error");
    } finally {
      setSavingBrand(false);
    }
  }

  async function deleteVendor(id: string) {
    await api.delete(`/vendors/${id}`);
    loadVendors();
    showToast("Vendor removed.");
  }

  async function savePhoneNumber(id: string) {
    if (!phoneInput.trim()) return;
    setSavingPhone(true);
    try {
      await api.put(`/vendors/${id}`, { whatsapp_number: phoneInput.trim() });
      showToast("Phone number saved.");
      setPhoneEditingId(null);
      setPhoneInput("");
      loadVendors();
    } catch {
      showToast("Failed to save phone number.", "error");
    } finally {
      setSavingPhone(false);
    }
  }

  async function uploadVendorCsv() {
    if (!vendorCsv) return;
    const formData = new FormData();
    formData.append("file", vendorCsv);
    const res = await api.post("/vendors/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    showToast(`Imported ${res.data.created.length} vendors, skipped ${res.data.skipped.length}.`);
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
    showToast(`Added item "${itemForm.name}".`);
    setItemForm({ name: "", unit: "", category: "" });
    loadItems();
  }

  async function deleteItem(id: string) {
    await api.delete(`/items/${id}`);
    loadItems();
    showToast("Item removed.");
  }

  async function uploadItemCsv() {
    if (!itemCsv) return;
    const formData = new FormData();
    formData.append("file", itemCsv);
    const res = await api.post("/items/import-csv", formData, { headers: { "Content-Type": "multipart/form-data" } });
    showToast(`Imported ${res.data.created.length} items.`);
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
            showToast("Vendor added.");
          }}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your branding, vendors, and item master here at any time.</p>
      </div>

      <form onSubmit={saveBrand} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="font-medium text-gray-900">Branding</h2>
        <div className="flex items-start gap-5">
          {logoFile ? (
            <img src={URL.createObjectURL(logoFile)} alt="New logo preview" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : account?.logo_url ? (
            <img src={account.logo_url} alt="Current logo" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: account?.brand_hex_color || "#4F46E5" }}
            >
              {(brandName || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setLogoFile(f);
            }}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${
              dragOver ? "border-brand bg-brand/10 text-brand" : "border-gray-300 bg-gray-50 text-gray-500 hover:border-brand hover:bg-brand/5 hover:text-brand"
            }`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="font-medium">{logoFile ? logoFile.name : "Click or drag a logo image here"}</span>
            <span className="text-xs text-gray-400">PNG or JPG, square image recommended</span>
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Merchant name</label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your restaurant / brand name"
            className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" disabled={savingBrand} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {savingBrand ? "Saving..." : "Save branding"}
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
        {loading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : (
        <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
          {vendors.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No vendors yet.</p>}
          {vendors.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{v.name}</span>
                {v.whatsapp_number && <span className="ml-2 text-gray-400">{v.whatsapp_number}</span>}
                {v.poc_name && <span className="ml-2 text-gray-400">POC: {v.poc_name}{v.poc_number ? ` (${v.poc_number})` : ""}</span>}
                {v.description && <span className="ml-2 text-gray-400">{v.description}</span>}
                {!v.whatsapp_number && (
                  phoneEditingId === v.id ? (
                    <span className="ml-2 inline-flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="+91..."
                        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => savePhoneNumber(v.id)}
                        disabled={!phoneInput.trim() || savingPhone}
                        className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {savingPhone ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setPhoneEditingId(null);
                          setPhoneInput("");
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setPhoneEditingId(v.id);
                        setPhoneInput("");
                      }}
                      className="ml-2 text-xs text-brand hover:underline"
                    >
                      + Add phone number
                    </button>
                  )
                )}
              </div>
              <button onClick={() => deleteVendor(v.id)} className="shrink-0 text-xs text-red-500 hover:text-red-700">
                Remove
              </button>
            </div>
          ))}
        </div>
        )}
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
        {loading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : (
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
        )}
      </div>
    </div>
  );
}
