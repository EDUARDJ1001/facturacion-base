export function Spinner({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-3 rounded-full bg-white/80 px-5 py-3 shadow-soft">
        <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
    </div>
  );
}
