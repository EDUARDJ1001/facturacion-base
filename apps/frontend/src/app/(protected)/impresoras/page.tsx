import { PrinterSettings } from "@/components/forms/printer-settings";

/** Impresoras de este equipo: disponible para todos los usuarios (se guarda en la PC). */
export default function ImpresorasPage() {
  return (
    <section className="mx-auto w-full max-w-6xl">
      <PrinterSettings />
    </section>
  );
}
