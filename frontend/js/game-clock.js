import { API_BASE_URL } from './config.js';

let epoch = Date.now();
let origin = performance.now();
export function serverNow() { return epoch + performance.now() - origin; }
export async function syncGameClock() {
  const before = performance.now();
  const response = await fetch(`${API_BASE_URL}/api/time`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Clock sync failed');
  const { serverTime } = await response.json();
  if (!Number.isFinite(serverTime)) throw new Error('Invalid server time');
  origin = performance.now();
  epoch = serverTime + (origin - before) / 2;
}
await syncGameClock().catch(() => {});
setInterval(() => syncGameClock().catch(() => {}), 30000);
