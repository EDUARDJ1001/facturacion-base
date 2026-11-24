import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** `required`: campo obligatorio, se marca con un asterisco rojo. */
export function Label({ className, required, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("mb-2 block text-sm font-medium text-slate-700", className)} {...props}>
      {children}
      {required ? (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

/** Aviso para formularios con campos obligatorios. */
export function RequiredHint({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-slate-500", className)}>
      Los campos con <span className="text-rose-500">*</span> son obligatorios.
    </p>
  );
}
