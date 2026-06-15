const store = new Map();

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs = 30000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clear() {
  store.clear();
}

export function stats() {
  return { size: store.size, keys: [...store.keys()] };
}
