// frontend/src/lib/api.ts
const API_URL = import.meta.env.API_URL || "http://localhost:4000";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export async function api<T>(
  path: string,
  options?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) return null;

    const json: ApiResponse<T> = await res.json();
    return json.success ? json.data : null;
  } catch (error) {
    console.error(`API error [${path}]:`, error);
    return null;
  }
}

// Typed helpers
export const getProducts = (params?: string) =>
  api<{ products: any[]; pagination: any }>(
    `/products${params ? `?${params}` : ""}`,
  );

export const getProduct = async (categorySlug: string, productSlug: string) => {
  const data = await api<{ product: any; manufacturer: any; related: any[] }>(
    `/shop/product/${productSlug}`,
  );
  return data
    ? {
        product: data.product,
        manufacturer: data.manufacturer,
        related: data.related || [],
      }
    : null;
};

export const getCategories = () => api<any[]>("/categories");

export const getCategory = (slug: string) => api<any>(`/categories/${slug}`);

export const getManufacturers = () => api<any[]>("/manufacturers");

export const getManufacturer = (slug: string) =>
  api<any>(`/manufacturers/${slug}`);

export const getPopularProducts = (limit = 8) =>
  api<any[]>(`/products/popular?limit=${limit}`);

export const getLatestProducts = (limit = 8) =>
  api<any[]>(`/products/latest?limit=${limit}`);

export const getProductsByPower = (power: string, rpm?: string) =>
  api<{ products: any[]; pagination: any }>(
    `/products/by-power/${power}${rpm ? `?rpm=${rpm}` : ""}`,
  );

export const getBlogPost = (slug: string) => api<any>(`/blog/${slug}`);

export const getBlogPosts = (page = 1) => api<any[]>(`/blog?page=${page}`);

export const getLegalPage = (slug: string) => api<any>(`/legal/${slug}`);
