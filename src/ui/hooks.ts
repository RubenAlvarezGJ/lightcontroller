import { useEffect, useState } from 'preact/hooks';

/** Re-renders when a store with subscribe(cb) => unsubscribe changes. */
export function useStore<T>(store: { subscribe(cb: () => void): () => void }, read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    setValue(read);
    return store.subscribe(() => setValue(read));
  }, [store]);
  return value;
}
