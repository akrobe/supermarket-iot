export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export function requireFields(obj, fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null) {
      const e = new Error(`Missing field: ${f}`);
      e.statusCode = 400; throw e;
    }
  }
}

export function ulid() {
  // Lightweight ULID-like ID (good enough for this project)
  const now = Date.now().toString(36).padStart(8, '0');
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  const random = Array.from(arr).map(b => b.toString(36).padStart(2,'0')).join('').slice(0,14);
  return `${now}${random}`;
}
