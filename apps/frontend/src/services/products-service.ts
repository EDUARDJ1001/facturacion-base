import { apiRequest } from "@/lib/api-client";
import type { Pagination, Product, ProductCategory } from "@/types/api";

export const productsService = {
  listCategories: (params: URLSearchParams) =>
    apiRequest<{ items: ProductCategory[]; pagination: Pagination }>(`/api/products/categories?${params.toString()}`),
  createCategory: (payload: unknown) =>
    apiRequest<{ message: string; item: ProductCategory }>("/api/products/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: ProductCategory }>(`/api/products/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateCategoryStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: ProductCategory }>(`/api/products/categories/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    }),
  nextCode: () => apiRequest<{ item: { code: string } }>("/api/products/next-code"),
  list: (params: URLSearchParams) => apiRequest<{ items: Product[]; pagination: Pagination }>(`/api/products?${params.toString()}`),
  create: (payload: unknown) => apiRequest<{ message: string; item: Product }>("/api/products", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: Product }>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: Product }>(`/api/products/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) })
};
