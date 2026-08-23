import { api } from './api.js';

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'UNSUPPORTED' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };
  const { publicKey } = await api.get('/api/push/public-key', { auth: true });
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.post('/api/push/subscriptions', subscription.toJSON(), { auth: true });
  localStorage.setItem('piumPushDismissed', 'true');
  return { ok: true };
}

export function dismissPushPrompt() {
  localStorage.setItem('piumPushDismissed', 'true');
}

export function shouldShowPushPrompt() {
  return pushSupported() && localStorage.getItem('piumPushDismissed') !== 'true';
}
