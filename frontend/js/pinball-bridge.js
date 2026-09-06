// Reuse the authenticated page socket; iframe never opens a second connection.
export function attachPinballBridge(socket) {
  let gameId = null;
  let latest = null;
  const frames = () => [...document.querySelectorAll('iframe')].filter(frame => {
    try {
      const url = new URL(frame.getAttribute('src'), location.href);
      return url.origin === location.origin && url.pathname === '/pinball-local/' && Number(url.searchParams.get('gameId')) === gameId;
    } catch { return false; }
  });
  const deliver = () => {
    if (latest) frames().forEach(frame => frame.contentWindow?.postMessage({ type: 'pinball:state', snapshot: latest }, location.origin));
  };
  const receive = snapshot => {
    if (snapshot?.gameId !== gameId || !Number.isSafeInteger(snapshot.seq) || (latest && snapshot.seq <= latest.seq)) return;
    latest = snapshot;
    deliver();
  };
  const join = () => {
    if (gameId && socket.connected) socket.emit('pinball:join', { gameId }, response => {
      if (response?.ok) receive(response.data);
    });
  };
  const ready = event => {
    if (event.origin !== location.origin || event.data?.type !== 'pinball:ready') return;
    const frame = [...document.querySelectorAll('iframe')].find(item => item.contentWindow === event.source);
    if (!frame) return;
    const url = new URL(frame.getAttribute('src'), location.href);
    const requested = Number(event.data.gameId);
    if (url.origin !== location.origin || url.pathname !== '/pinball-local/' || Number(url.searchParams.get('gameId')) !== requested) return;
    if (gameId !== requested) { gameId = requested; latest = null; }
    deliver();
    join();
  };
  const reconnect = () => {
    if (gameId && frames().length) {
      console.info(`[PINBALL] viewer reconnected gameId=${gameId}`);
      join();
    }
  };
  const ended = game => {
    if (Number(game?.id) !== gameId) return;
    if (game.state?.pinballSnapshot) receive(game.state.pinballSnapshot);
    socket.emit('pinball:leave');
    gameId = null; latest = null;
  };
  addEventListener('message', ready);
  socket.on('connect', reconnect);
  socket.on('pinball:state', receive);
  socket.on('pinball:snapshot', receive);
  socket.on('pinball:end', receive);
  socket.on('game:global:ended', ended);
  return () => {
    removeEventListener('message', ready);
    socket.off('connect', reconnect);
    socket.off('pinball:state', receive);
    socket.off('pinball:snapshot', receive);
    socket.off('pinball:end', receive);
    socket.off('game:global:ended', ended);
  };
}
