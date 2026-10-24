import { useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router';

export function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // Write through immediately: two actions before a router commit must merge
  // against the newest requested query, not restore filters from an old closure.
  const latestParams = useRef(searchParams);
  useLayoutEffect(() => { latestParams.current = searchParams; }, [searchParams, location.key]);

  const params = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      result[key] = value;
    }
    return result;
  }, [searchParams]);

  const setParam = useCallback((key: string, value: string | number | null) => {
    const newParams = new URLSearchParams(latestParams.current);

    if (value === null || value === '') {
      newParams.delete(key);
    } else {
      newParams.set(key, String(value));
    }

    latestParams.current = newParams;
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams]);

  const setParams = useCallback((updates: Record<string, string | number | null>) => {
    const newParams = new URLSearchParams(latestParams.current);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });

    latestParams.current = newParams;
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams]);

  const getParam = useCallback((key: string, defaultValue = '') => {
    return searchParams.get(key) || defaultValue;
  }, [searchParams]);

  const clearParams = useCallback(() => {
    latestParams.current = new URLSearchParams();
    setSearchParams(latestParams.current, { replace: true });
  }, [setSearchParams]);

  return {
    params,
    setParam,
    setParams,
    getParam,
    clearParams,
  };
}
