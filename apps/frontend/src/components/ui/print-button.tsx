"use client";

import { useRef, useState } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

interface PrintButtonProps extends Omit<ButtonProps, "onClick" | "type"> {
  /** Envía el documento a la impresora; el botón queda bloqueado hasta que termine. */
  onPrint: () => Promise<unknown>;
  /** Texto mientras imprime (si el botón tiene texto). */
  busyLabel?: string;
}

/**
 * Botón de imprimir que no manda el documento dos veces: se bloquea desde el primer
 * clic (antes de que la pantalla se vuelva a dibujar) hasta que la impresión termina.
 */
export function PrintButton({ onPrint, busyLabel = "Imprimiendo...", children, disabled, ...props }: PrintButtonProps) {
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);

  const print = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await onPrint();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const hasText = typeof children === "string" || (Array.isArray(children) && children.some((child) => typeof child === "string"));

  return (
    <Button {...props} type="button" disabled={busy || disabled} aria-busy={busy} onClick={() => void print()}>
      {busy && hasText ? busyLabel : children}
    </Button>
  );
}
