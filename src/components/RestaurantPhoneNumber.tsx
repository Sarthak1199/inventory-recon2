import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export function RestaurantPhoneNumber() {
  const { account, refresh } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(account?.phone_number ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("phone_number", value.trim());
      await api.post("/onboarding/setup", formData, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      showToast("Your phone number saved.");
      setEditing(false);
    } catch {
      showToast("Failed to save phone number.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (account?.phone_number && !editing) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <h2 className="font-medium text-gray-900">Your phone number</h2>
          <p className="text-sm text-gray-500">{account.phone_number}</p>
        </div>
        <button
          onClick={() => {
            setValue(account.phone_number ?? "");
            setEditing(true);
          }}
          className="shrink-0 text-xs text-brand hover:underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-1 font-medium text-gray-900">Your phone number</h2>
      <p className="mb-3 text-xs text-gray-500">Send POs and invoices from WhatsApp in a click.</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+91..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={!value.trim() || saving}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {account?.phone_number && (
          <button
            onClick={() => setEditing(false)}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
