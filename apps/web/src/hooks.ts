import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useApp } from './ctx';

/** Carga datos de la API con estados de carga/error y recarga automática cuando cambian los datos de la app. */
export function useData<T>(path: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!path) return;
    const n = ++seq.current;
    setError(false);
    api<T>(path).then((d) => n === seq.current && (setData(d), setLoading(false))).catch(() => n === seq.current && (setError(true), setLoading(false)));
  }, [path]);
  useEffect(() => { load(); }, [load, version]);
  return { data, error, loading: loading && !data, reload: load };
}
