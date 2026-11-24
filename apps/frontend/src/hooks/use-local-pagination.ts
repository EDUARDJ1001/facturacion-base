import { useEffect, useState } from "react";

import { PAGE_SIZE_DEFAULT } from "@/components/ui/pagination";

/**
 * Paginación de una lista que ya está completa en pantalla (reportes, registro de
 * cajas). Vuelve a la primera página cuando cambia `resetKey` (p. ej. los filtros).
 */
export function useLocalPagination<T>(items: T[], resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  useEffect(() => setPage(1), [resetKey]);

  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, lastPage);

  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    pagination: { page: current, pageSize, total: items.length },
    onPageChange: setPage,
    onPageSizeChange: (next: number) => {
      setPageSize(next);
      setPage(1);
    }
  };
}
