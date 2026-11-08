import { useToastStore } from '../stores/toastStore';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className="pointer-events-auto rounded-xl border border-surface1 bg-surface0 px-4 py-2 text-sm text-text shadow-sm"
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
