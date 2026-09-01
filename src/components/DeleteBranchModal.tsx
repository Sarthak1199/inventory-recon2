import { useState } from "react";
import { api } from "../lib/api";

interface Branch {
  id: string;
  name: string;
  code: string;
}

export function DeleteBranchModal({
  branch,
  otherBranches,
  poCount,
  grnCount,
  onClose,
  onDeleted,
}: {
  branch: Branch;
  otherBranches: Branch[];
  poCount: number;
  grnCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const hasFallbackOption = otherBranches.length > 0;
  const [mode, setMode] = useState<"reassign" | "delete_data">(hasFallbackOption ? "reassign" : "delete_data");
  const [fallbackBranchId, setFallbackBranchId] = useState(otherBranches[0]?.id ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTypedConfirm = mode === "delete_data";
  const confirmMatches = confirmText.trim().toUpperCase() === branch.code.toUpperCase();

  async function handleConfirm() {
    if (mode === "reassign" && !fallbackBranchId) {
      setError("Choose a branch to move this data to.");
      return;
    }
    if (needsTypedConfirm && !confirmMatches) {
      setError(`Type ${branch.code} to confirm.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/branches/${branch.id}`, {
        data: mode === "reassign" ? { action: "reassign", fallbackBranchId } : { action: "delete_data" },
      });
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to delete branch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Delete {branch.name}?</h2>
        <p className="mb-4 text-sm text-gray-500">
          This branch has <span className="font-medium text-gray-700">{poCount} purchase order(s)</span> and{" "}
          <span className="font-medium text-gray-700">{grnCount} GRN(s)</span> on record. Choose what happens to that data.
        </p>

        <div className="space-y-2">
          {hasFallbackOption && (
            <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5">
              <input
                type="radio"
                name="delete-branch-mode"
                checked={mode === "reassign"}
                onChange={() => setMode("reassign")}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-gray-900">Move its data to another branch</span>
                <span className="block text-gray-500">All purchase orders and GRNs are reassigned to the branch you pick.</span>
                {mode === "reassign" && (
                  <select
                    value={fallbackBranchId}
                    onChange={(e) => setFallbackBranchId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  >
                    {otherBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
          )}

          <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
            <input
              type="radio"
              name="delete-branch-mode"
              checked={mode === "delete_data"}
              onChange={() => setMode("delete_data")}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-gray-900">Delete all its purchase orders and GRNs</span>
              <span className="block text-gray-500">This permanently removes every PO and GRN tied to this branch. Cannot be undone.</span>
              {mode === "delete_data" && (
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type ${branch.code} to confirm`}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
              )}
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || (needsTypedConfirm && !confirmMatches)}
            className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Deleting..." : "Delete branch"}
          </button>
        </div>
      </div>
    </div>
  );
}
