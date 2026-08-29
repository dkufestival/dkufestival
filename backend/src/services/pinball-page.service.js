const SOURCE_URL = 'https://lazygyu.github.io/roulette/';
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedPage = null;
let cachedAt = 0;

const viewerBootstrap = String.raw`
<style>
  html.festival-pinball-viewer #settings,
  html.festival-pinball-viewer #notice,
  html.festival-pinball-viewer .copyright,
  html.festival-pinball-viewer .modal-overlay,
  html.festival-pinball-viewer #btnToggleSettings { display: none !important; }
  html.festival-pinball-viewer,
  html.festival-pinball-viewer body { margin: 0 !important; overflow: hidden !important; background: #0d0d12 !important; }
  html.festival-pinball-viewer body { pointer-events: none !important; user-select: none !important; }
  #festival-pinball-status { position: fixed; z-index: 99999; inset: 0; display: grid; place-items: center; padding: 24px; color: #fff; background: #0d0d12; font: 700 16px/1.5 sans-serif; text-align: center; }
</style>
<script>
(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('viewer') !== '1') return;

  document.documentElement.classList.add('festival-pinball-viewer');

  const makeRandom = (initialSeed) => {
    let seed = initialSeed >>> 0;
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  };

  let readyAttempts = 0;
  const showStatus = (message) => {
    let status = document.getElementById('festival-pinball-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'festival-pinball-status';
      document.body.appendChild(status);
    }
    status.textContent = message;
  };
  const clearStatus = () => document.getElementById('festival-pinball-status')?.remove();

  const begin = () => {
    if (!window.roulette || !window.roulette.isReady) {
      readyAttempts += 1;
      if (readyAttempts > 400) {
        showStatus('핀볼 리소스를 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.');
        return;
      }
      window.setTimeout(begin, 50);
      return;
    }

    const names = (params.get('names') || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (!names.length) return;

    const seed = Number(params.get('seed')) >>> 0 || 1;
    Math.random = makeRandom(seed);
    try {
      window.roulette.setMarbles(names);
      const marbleCount = window.roulette.getCount();
      if (marbleCount < 2) {
        showStatus('핀볼 참가자는 2명 이상이어야 합니다.');
        return;
      }
      const lastPlace = marbleCount - 1;
      window.roulette.setWinnerRange(lastPlace, lastPlace);
      clearStatus();

      const startAt = Number(params.get('startAt')) || Date.now();
      window.setTimeout(() => window.roulette.start(), Math.max(0, Math.min(startAt - Date.now(), 5000)));
    } catch (error) {
      console.error('Pinball viewer failed', error);
      showStatus('핀볼 게임을 시작하지 못했습니다. 화면을 새로고침해주세요.');
    }
  };

  window.addEventListener('DOMContentLoaded', () => showStatus('핀볼 게임을 불러오는 중입니다...'), { once: true });
  window.addEventListener('load', () => window.setTimeout(begin, 100), { once: true });
})();
</script>`;

function injectViewer(html) {
  const externalizedAssets = html.replace(
    /([=\"'])\/roulette\//g,
    `$1${SOURCE_URL}`
  );
  const injectedHead = `<base href="${SOURCE_URL}">${viewerBootstrap}`;
  if (/<head(?:\s[^>]*)?>/i.test(externalizedAssets)) {
    return externalizedAssets.replace(/<head([^>]*)>/i, `<head$1>${injectedHead}`);
  }
  return externalizedAssets.replace(/<html([^>]*)>/i, `<html$1><head>${injectedHead}</head>`);
}

async function getPinballPage() {
  if (cachedPage && Date.now() - cachedAt < CACHE_TTL_MS) return cachedPage;

  const response = await fetch(SOURCE_URL, {
    headers: { 'user-agent': 'DKU Festival Pinball Viewer/1.0' },
  });
  if (!response.ok) throw new Error(`PINBALL_SOURCE_${response.status}`);

  cachedPage = injectViewer(await response.text());
  cachedAt = Date.now();
  return cachedPage;
}

module.exports = { SOURCE_URL, getPinballPage, injectViewer };
