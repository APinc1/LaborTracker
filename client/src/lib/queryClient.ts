import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let responseText = '';
    try {
      // Try to get response text first (can be parsed as JSON later)
      responseText = await res.text();
    } catch (e) {
      // If we can't read the response body, use status text
      throw new Error(`${res.status}: ${res.statusText}`);
    }

    try {
      // Try to parse as JSON
      const jsonError = JSON.parse(responseText);
      // If the response has an error field, use that message
      if (jsonError.error) {
        throw new Error(jsonError.error);
      }
      // Otherwise use the JSON as string
      throw new Error(JSON.stringify(jsonError));
    } catch (parseError) {
      // If JSON parsing fails, use the raw text or status text
      throw new Error(responseText || `${res.status}: ${res.statusText}`);
    }
  }
}

export async function apiRequest(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
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
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
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
