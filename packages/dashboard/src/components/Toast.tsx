import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ToastTone = "neutral" | "ok" | "warn" | "err";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TONE_ICON: Record<ToastTone, IconName> = {
  neutral: "info",
  ok: "check",
  warn: "alert",
  err: "alert",
};

/** Bottom-centre transient notices: copy confirmations, deletions, errors. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "neutral"): void => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "err" ? 5000 : 2400);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            <Icon name={TONE_ICON[item.tone]} size={14} />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
