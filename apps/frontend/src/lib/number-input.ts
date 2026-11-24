import type { ClipboardEvent, FocusEvent, FormEvent, InputHTMLAttributes, KeyboardEvent } from "react";

import { isCountableUnit } from "@/lib/inventory-rules";

/**
 * Propiedades para campos numéricos según lo que representan:
 *   - integerInput: piezas, conteos, puertos, porcentajes enteros (sin punto).
 *   - moneyInput: montos en lempiras y medidas (hasta 2 decimales).
 *   - quantityInput(unidad): entero si el producto se vende por piezas (UND, CAJA...),
 *     con hasta 2 decimales si es una medida (KG, LT, HORA...).
 *
 * Son campos de TEXTO que solo aceptan números (no type="number"): así se pueden
 * seleccionar como cualquier texto, la rueda del mouse no cambia el valor y no
 * admiten "e", signos ni más decimales de los permitidos. Al entrar al campo se
 * selecciona todo, para escribir encima (p. ej. reemplazar el 0).
 */
type NumberInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "autoComplete" | "onKeyDown" | "onInput" | "onPaste" | "onFocus"
>;

const EDIT_KEYS = new Set(["Backspace", "Delete", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/** Texto resultante si se inserta `text` en la posición/selección actual. */
function nextValue(input: HTMLInputElement, text: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  return `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
}

function build(decimals: 0 | 2): NumberInputProps {
  const valid = decimals === 0 ? /^\d*$/ : /^\d*(\.\d{0,2})?$/;
  return {
    type: "text",
    inputMode: decimals === 0 ? "numeric" : "decimal",
    autoComplete: "off",
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey || EDIT_KEYS.has(event.key)) {
        return;
      }
      // Tecla sin identificar (teclados de Android, métodos de escritura): se deja
      // pasar y la valida onInput con el valor final.
      if (event.key.length !== 1) {
        return;
      }
      // Coma como separador decimal: se escribe punto.
      const key = decimals === 2 && event.key === "," ? "." : event.key;
      if (!valid.test(nextValue(event.currentTarget, key))) {
        event.preventDefault();
        return;
      }
      if (key !== event.key) {
        event.preventDefault();
        const input = event.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        input.setRangeText(".", start, input.selectionEnd ?? start, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    // Revisión del valor final (texto pegado, teclado del celular, dictado, arrastrar):
    // si queda inválido, vuelve al último valor válido. Corre antes que onChange.
    onInput: (event: FormEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const value = decimals === 2 ? input.value.replace(",", ".") : input.value;
      if (valid.test(value)) {
        if (value !== input.value) input.value = value;
        input.dataset.lastValid = value;
        return;
      }
      const caret = Math.max(0, (input.selectionStart ?? 1) - 1);
      input.value = input.dataset.lastValid ?? "";
      input.setSelectionRange(Math.min(caret, input.value.length), Math.min(caret, input.value.length));
    },
    onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData("text").trim().replace(/\s/g, "");
      if (!valid.test(nextValue(event.currentTarget, text))) {
        event.preventDefault();
      }
    },
    onFocus: (event: FocusEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      input.dataset.lastValid = input.value;
      // Tras el clic el navegador reubica el cursor: se selecciona un momento después.
      window.setTimeout(() => {
        if (document.activeElement === input) input.select();
      }, 0);
    }
  };
}

export const integerInput = build(0);
export const moneyInput = build(2);

export function quantityInput(unit: string | null | undefined): NumberInputProps {
  return !unit || isCountableUnit(unit) ? integerInput : moneyInput;
}
