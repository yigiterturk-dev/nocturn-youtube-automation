import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Artifacts sit behind bearer auth, so <a href> cannot fetch them directly.
export async function openProtectedFile(url: string, download?: string) {
  const res = await fetch(url, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  await throwIfResNotOk(res);
  const objectUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  if (download) link.download = download;
  else link.target = "_blank";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
