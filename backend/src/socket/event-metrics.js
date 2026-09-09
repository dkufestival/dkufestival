// Counts only names for which this server registered an application handler.
// Socket.IO transport packets and unknown client events therefore never enter totals.
const INTERNAL_EVENTS = new Set(['connect', 'connect_error', 'disconnect', 'disconnecting', 'error']);

function instrumentApplicationEvents(socket, record) {
  const registered = new Set();
  const originalOn = socket.on;
  const originalOnce = socket.once;
  const register = (event) => {
    if (typeof event === 'string' && !INTERNAL_EVENTS.has(event)) registered.add(event);
  };
  socket.on = function instrumentedOn(event, listener) {
    register(event);
    return originalOn.call(this, event, listener);
  };
  socket.once = function instrumentedOnce(event, listener) {
    register(event);
    return originalOnce.call(this, event, listener);
  };
  socket.onAny((event) => { if (registered.has(event)) record(); });
}

module.exports = { instrumentApplicationEvents };
