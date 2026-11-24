import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL"
  }).format(value);
}

export function formatDate(value: string) {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("es-HN");
  }

  return new Date(value).toLocaleDateString("es-HN");
}

export function todayInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Nombre de archivo que define el backend (Content-Disposition); fallback si no viene. */
export function filenameFromResponse(response: Response, fallback: string) {
  const match = response.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}
