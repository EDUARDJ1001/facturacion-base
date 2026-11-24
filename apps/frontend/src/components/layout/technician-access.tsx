"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { setTechnicianToken } from "@/lib/technician";
import { systemService } from "@/services/system-service";

/**
 * Acceso escondido a la conexión de la base de datos (Ctrl + Shift + F9 en cualquier
 * pantalla). Pide la clave de técnico; con ella se abre la pantalla de conexión aunque
 * la base responda y sin iniciar sesión. No aparece en ningún menú.
 */
export function TechnicianAccess() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.key === "F9") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const { token } = await systemService.technicianLogin(password);
      setTechnicianToken(token);
      close();
      router.push("/configuracion-inicial?tecnico=1");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setChecking(false);
      setPassword("");
    }
  };

  return (
    <Modal open={open} onClose={close} eyebrow="Acceso restringido" title="Clave">
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <Input type="password" autoComplete="off" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} aria-label="Clave" />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={checking || !password}>
            {checking ? "Comprobando..." : "Entrar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
