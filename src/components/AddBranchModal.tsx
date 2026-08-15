import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  whatsapp_number?: string | null;
  manager_name?: string | null;
  manager_phone?: string | null;
}

export function AddBranchModal({
  onClose,
  onCreated,
  branch,
}: {
  onClose: () => void;
  onCreated: (branch: Branch) => void;
  branch?: Branch;
}) {
  const isEdit = !!branch;
  const [name, setName] = useState(branch?.name ?? "");
  const [code, setCode] = useState(branch?.code ?? "");
  const [managerName, setManagerName] = useState(branch?.manager_name ?? "");
  const [managerPhone, setManagerPhone] = useState(branch?.manager_phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Branch name is required.");
      return;
    }
    if (!code.trim()) {
      setError("Branch ID is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        managerName: managerName?.trim() || null,
        managerPhone: managerPhone?.trim() || null,
      };
      const res = isEdit ? await api.put(`/branches/${branch!.id}`, payload) : await api.post("/branches", payload);
      onCreated(res.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? `Failed to ${isEdit ? "update" : "add"} branch`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{isEdit ? "Edit branch" : "Add new branch"}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Branch name *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Branch ID *</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. KOR"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Store manager name</label>
              <input
                value={managerName ?? ""}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Store manager number</label>
              <input
                value={managerPhone ?? ""}
                onChange={(e) => setManagerPhone(e.target.value)}
                placeholder="+91..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Add branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
