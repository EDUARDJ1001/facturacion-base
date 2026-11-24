import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Pagination as PaginationMeta } from "@/types/api";

/** Filas por página: 50 como máximo para no cargar de más la pantalla. */
export const PAGE_SIZE_DEFAULT = 50;
const pageSizeOptions = [10, 25, PAGE_SIZE_DEFAULT];

interface PaginationProps {
  pagination: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({ pagination, onPageChange, onPageSizeChange }: PaginationProps) {
  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? PAGE_SIZE_DEFAULT;
  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(total, page * pageSize);
  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  const goToPage = (nextPage: number) => {
    onPageChange(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <div className="flex flex-col gap-3 rounded-none border-0 bg-transparent px-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:rounded-[24px] sm:border sm:border-border sm:bg-white sm:px-4">
      <div className="text-sm text-slate-600">
        Mostrando <span className="font-semibold text-slate-900">{startItem}</span> a <span className="font-semibold text-slate-900">{endItem}</span> de{" "}
        <span className="font-semibold text-slate-900">{total}</span>
      </div>

      <div className="grid gap-3 sm:flex sm:items-center">
        <label className="flex items-center justify-between gap-3 text-sm text-slate-600 sm:justify-start">
          Por página
          <select
            className="h-10 rounded-2xl border border-border bg-white px-3 text-sm text-slate-700 outline-none"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button type="button" variant="secondary" size="sm" className="h-10 w-10 px-0" onClick={() => goToPage(1)} disabled={!canGoBack} aria-label="Primera página">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 w-10 px-0"
            onClick={() => goToPage(page - 1)}
            disabled={!canGoBack}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-sm font-semibold text-slate-700">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 w-10 px-0"
            onClick={() => goToPage(page + 1)}
            disabled={!canGoForward}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 w-10 px-0"
            onClick={() => goToPage(totalPages)}
            disabled={!canGoForward}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
