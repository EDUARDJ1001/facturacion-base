"use client";

import { Check, Eye, EyeOff, Sparkles, X } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Mismas reglas que el servidor: 8 a 72 caracteres, con letra y número. */
export const PASSWORD_RULES = [
  { label: "Al menos 8 caracteres", test: (value: string) => value.length >= 8 && value.length <= 72 },
  { label: "Una letra", test: (value: string) => /[A-Za-z]/.test(value) },
  { label: "Un número", test: (value: string) => /[0-9]/.test(value) }
];

export function isStrongPassword(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

/** Contraseña aleatoria de 12 caracteres sin letras que se confunden (l, 1, O, 0). */
export function generatePassword() {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (n, i) => (i === 0 ? letters : i === 1 ? digits : all)[n % (i === 0 ? letters.length : i === 1 ? digits.length : all.length)]);
  // La letra y el número obligatorios no quedan siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  value: string;
  /** Pone una contraseña generada (la muestra para que se pueda copiar o comunicar). */
  onGenerate?: (password: string) => void;
  invalid?: boolean;
}

/**
 * Campo de contraseña con botón para verla, requisitos que se marcan mientras se
 * escribe y opción de generar una segura.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { value, onGenerate, invalid, className, id, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const hintId = id ? `${id}-requisitos` : undefined;

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            aria-invalid={invalid}
            aria-describedby={hintId}
            className={cn("pr-12 font-mono", className)}
            value={value}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-2xl text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {onGenerate ? (
          <button
            type="button"
            onClick={() => {
              onGenerate(generatePassword());
              setVisible(true);
            }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Generar
          </button>
        ) : null}
      </div>
      <ul id={hintId} className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-live="polite">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(value);
          return (
            <li key={rule.label} className={cn("inline-flex items-center gap-1", ok ? "text-emerald-700" : "text-slate-500")}>
              {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              {rule.label}
              <span className="sr-only">{ok ? ": cumple" : ": falta"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
