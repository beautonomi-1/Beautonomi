import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";

export function useCheckAvailability() {
  const [loading, setLoading] = useState(false);

  const check = useCallback(async (urlPathAndQuery: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ available?: boolean; conflicts?: string[] }>(urlPathAndQuery);
      if (res.error) {
        return { ok: false as const, available: false, conflicts: [] as string[], message: res.error.message };
      }
      return {
        ok: true as const,
        available: res.data?.available === true,
        conflicts: res.data?.conflicts ?? [],
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { check, loading };
}
