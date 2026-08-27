// 좌석 지도(테이블 배치도) 확대/축소/이동 제어
export function initMapZoom({ viewport, canvas, minScale: baseMinScale = 1, maxScale = 3, zoomedThreshold = 1.6, onScaleChange }) {
  let minScale = baseMinScale;
  let scale = minScale;
  let x = 0;
  let y = 0;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let lastTap = 0;

  function apply() {
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    canvas.classList.toggle('zoomed', scale >= zoomedThreshold);
    onScaleChange?.(scale);
  }

  function setScale(nextScale, cx, cy) {
    const prevScale = scale;
    scale = Math.min(maxScale, Math.max(minScale, nextScale));
    const ratio = scale / prevScale;
    x = cx - (cx - x) * ratio;
    y = cy - (cy - y) * ratio;
    apply();
  }

  function reset() {
    scale = minScale;
    x = 0;
    y = 0;
    apply();
  }

  function refreshMinScale() {
    if (!canvas.offsetWidth || !canvas.offsetHeight) return;
    const fitScale = Math.min(
      viewport.clientWidth / canvas.offsetWidth,
      viewport.clientHeight / canvas.offsetHeight,
    );
    minScale = Math.min(baseMinScale, fitScale);
    if (scale < minScale) {
      scale = minScale;
      apply();
    }
  }

  function touchDist(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function touchMid(touches, rect) {
    const [a, b] = touches;
    return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
  }

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    setScale(scale * (event.deltaY < 0 ? 1.12 : 0.89), cx, cy);
  }, { passive: false });

  viewport.addEventListener('mousedown', (event) => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    x += event.clientX - lastX;
    y += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    moved = true;
    apply();
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  viewport.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
      dragging = true;
      moved = false;
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
      const now = Date.now();
      if (now - lastTap < 320) {
        const rect = viewport.getBoundingClientRect();
        const cx = event.touches[0].clientX - rect.left;
        const cy = event.touches[0].clientY - rect.top;
        setScale(scale >= zoomedThreshold ? minScale : zoomedThreshold + 0.3, cx, cy);
      }
      lastTap = now;
    } else if (event.touches.length === 2) {
      dragging = false;
      pinchStartDist = touchDist(event.touches);
      pinchStartScale = scale;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (event) => {
    if (event.touches.length === 1 && dragging) {
      const dx = event.touches[0].clientX - lastX;
      const dy = event.touches[0].clientY - lastY;
      x += dx;
      y += dy;
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
      moved = true;
      apply();
    } else if (event.touches.length === 2) {
      const rect = viewport.getBoundingClientRect();
      const dist = touchDist(event.touches);
      const mid = touchMid(event.touches, rect);
      setScale(pinchStartScale * (dist / pinchStartDist), mid.x, mid.y);
    }
    event.preventDefault();
  }, { passive: false });

  viewport.addEventListener('touchend', (event) => {
    if (event.touches.length === 0) dragging = false;
  });

  window.addEventListener('resize', refreshMinScale);

  refreshMinScale();
  apply();

  return {
    zoomIn: () => setScale(scale * 1.3, viewport.clientWidth / 2, viewport.clientHeight / 2),
    zoomOut: () => setScale(scale / 1.3, viewport.clientWidth / 2, viewport.clientHeight / 2),
    reset,
    getScale: () => scale,
    hasMoved: () => moved,
    refreshMinScale,
  };
}
