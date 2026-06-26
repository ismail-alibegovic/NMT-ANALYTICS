import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      result[key] = value;
    }
    return result;
  }, [searchParams]);

  const setParam = useCallback((key: string, value: string | number | null) => {
    const newParams = new URLSearchParams(searchParams);

    if (value === null || value === '') {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setParams = useCallback((updates: Record<string, string | number | null>) => {
    const newParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const getParam = useCallback((key: string, defaultValue = '') => {
    return searchParams.get(key) || defaultValue;
  }, [searchParams]);

  const clearParams = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return {
    params,
    setParam,
    setParams,
    getParam,
    clearParams,
  };
}
