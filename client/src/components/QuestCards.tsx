import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface QuestCard {
  key: string;
  label: string;
  done: boolean;
}

interface QuestStatus {
  cards: QuestCard[];
  doneCount: number;
  total: number;
  dismissed: boolean;
}

const CTA: Record<string, { label: string; to: string }> = {
  vendor: { label: "Add vendor", to: "/onboarding" },
  item: { label: "Add items", to: "/onboarding" },
  po: { label: "Create PO", to: "/purchase-orders/new" },
  grn: { label: "Upload GRN", to: "/grns/upload" },
};

export function QuestCards() {
  const [status, setStatus] = useState<QuestStatus | null>(null);
  const navigate = useNavigate();

  async function load() {
    const res = await api.get("/onboarding/quest-status");
    setStatus(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  if (!status) return null;

  if (status.dismissed) {
    return (
      <button
        onClick={async () => {
          await api.post("/onboarding/quest-reopen");
          load();
        }}
        className="mb-6 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Setup {status.doneCount}/{status.total} done — reopen
      </button>
    );
  }

  if (status.doneCount === status.total) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
        <span>All set up! {status.doneCount}/{status.total} done.</span>
        <button
          onClick={async () => {
            await api.post("/onboarding/quest-dismiss");
            load();
          }}
          className="text-xs font-medium underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Get started — {status.doneCount}/{status.total} done</h2>
        <button
          onClick={async () => {
            await api.post("/onboarding/quest-dismiss");
            load();
          }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Dismiss
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {status.cards.map((card) => (
          <div
            key={card.key}
            className={`rounded-md border p-3 text-sm ${card.done ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-700"}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span>{card.done ? "✓" : "○"}</span>
              <span>{card.label}</span>
            </div>
            {!card.done && (
              <button
                onClick={() => navigate(CTA[card.key]?.to ?? "/")}
                className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white"
              >
                {CTA[card.key]?.label ?? "Go"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
