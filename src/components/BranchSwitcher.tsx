import { useAuth } from "../context/AuthContext";

export function BranchSwitcher() {
  const { branches, activeBranchId, switchBranch } = useAuth();
  if (branches.length === 0) return null;

  return (
    <select
      value={activeBranchId ?? ""}
      onChange={(e) => switchBranch(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 ring-brand"
    >
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
