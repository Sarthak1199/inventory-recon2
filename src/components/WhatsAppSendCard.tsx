import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.5 1.34 5.02L2 22l5.13-1.35A9.96 9.96 0 0012.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10zm5.86 14.2c-.25.7-1.24 1.28-2.03 1.45-.54.11-1.24.2-3.62-.78-3.04-1.26-5-4.34-5.15-4.54-.15-.2-1.23-1.63-1.23-3.11s.77-2.21 1.05-2.51c.25-.28.54-.34.72-.34.18 0 .36 0 .52.01.17.01.39-.06.61.47.25.6.85 2.08.92 2.23.07.15.12.32.02.51-.1.2-.15.32-.29.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.61.17.3.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.35 1.45.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.65-.15.26.1 1.63.77 1.91.91.28.15.47.22.53.34.07.13.07.72-.18 1.42z" />
    </svg>
  );
}

export function WhatsAppSendCard({
  hasWhatsapp,
  previewUrl,
  sendUrl,
  sentLabel,
  actionLabel,
  initialPreview,
}: {
  hasWhatsapp: boolean;
  previewUrl: string;
  sendUrl: string;
  sentLabel?: string;
  actionLabel: string;
  initialPreview?: { message: string; waLink: string | null } | null;
}) {
  const { showToast } = useToast();
  const [preview, setPreview] = useState<{ message: string; waLink: string | null } | null>(initialPreview ?? null);
  const [loadingPreview, setLoadingPreview] = useState(initialPreview === undefined && hasWhatsapp);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!hasWhatsapp || initialPreview !== undefined) {
      setLoadingPreview(false);
      return;
    }
    api.get(previewUrl).then((res) => setPreview(res.data)).finally(() => setLoadingPreview(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, hasWhatsapp]);

  async function handleSend() {
    setSending(true);
    try {
      const res = await api.post(sendUrl);
      setPreview({ message: res.data.message, waLink: res.data.waLink });
      if (res.data.waLink) window.open(res.data.waLink, "_blank");
      showToast("Opened in WhatsApp.");
    } catch {
      showToast("Failed to send on WhatsApp.", "error");
    } finally {
      setSending(false);
    }
  }

  if (!hasWhatsapp) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-gray-900">WhatsApp</h2>
        <p className="text-sm text-amber-600">Add your phone number above to enable sending on WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-2 font-medium text-gray-900">WhatsApp</h2>
      {loadingPreview ? (
        <div className="h-24 animate-pulse rounded-md bg-gray-100" />
      ) : (
        <pre className="mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-700">
          {preview?.message}
        </pre>
      )}
      {sentLabel && <p className="mb-2 text-xs text-gray-400">{sentLabel}</p>}
      <button
        onClick={handleSend}
        disabled={sending || loadingPreview}
        className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        <WhatsAppIcon />
        {sending ? "Opening WhatsApp..." : actionLabel}
      </button>
    </div>
  );
}
