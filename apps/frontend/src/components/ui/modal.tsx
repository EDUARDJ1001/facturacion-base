"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  eyebrow = "Formulario",
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Texto pequeño sobre el título. */
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Escape cierra la ventana (quien la abre decide si pide confirmar cambios sin guardar).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-border bg-white p-4 shadow-soft sm:max-h-[calc(100dvh-4rem)] sm:rounded-[28px] sm:p-6", className)}
      >
        <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
          <div className="min-w-0">
            <p className="section-title">{eyebrow}</p>
            <h3 id={titleId} className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h3>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            onClick={onClose}
            type="button"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
