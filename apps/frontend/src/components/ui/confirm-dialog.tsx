"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: acción destructiva (revocar, eliminar, desactivar). */
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Confirmaciones con el estilo del sistema (en lugar de window.confirm).
 * Uso: `if (await confirm({ title, message })) { ... }`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // Si había una confirmación abierta, se da por cancelada.
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) {
      return;
    }
    confirmButton.current?.focus();
    // En captura y marcado: si hay una ventana debajo, Escape cierra solo la confirmación.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, options]);

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-[24px] border border-border bg-white p-5 shadow-soft sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
                )}
              >
                {danger ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h3 id="confirm-title" className="text-lg font-semibold text-slate-900">
                  {options.title}
                </h3>
                <div className="mt-1 text-sm text-slate-600">{options.message}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => close(false)}>
                {options.cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                ref={confirmButton}
                type="button"
                className={danger ? "bg-rose-600 text-white hover:bg-rose-700" : undefined}
                onClick={() => close(true)}
              >
                {options.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error("useConfirm debe usarse dentro de ConfirmProvider.");
  }

  return context;
}
