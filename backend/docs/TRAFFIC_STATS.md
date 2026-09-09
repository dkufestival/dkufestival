# Traffic statistics

The backend collects aggregate operational traffic without storing IP addresses,
user agents, names, QR tokens, or JWTs.

## Definitions

- `totalUniqueParticipants`: historical distinct `participants.clientId` count. A
  participant may have more than one session row, so this avoids counting that
  browser identity twice. Existing participant data is included when the service
  starts and whenever an admin queries the statistics.
- `totalSessions`: historical `table_sessions` row count.
- Socket connection counters include every authenticated Socket.IO connection,
  including monitor and admin connections. Reconnects are new socket connections.
- Concurrent participant counters include only authenticated `PARTICIPANT`
  sockets. A `Map<participantId, Set<socketId>>` counts a participant with
  multiple tabs once.
- `currentHttpRps` and `currentSocketEventsPerSecond` are counts from the most
  recently completed one-second bucket. The one-minute averages are the mean of
  the latest up-to-60 completed buckets (zero buckets after a restart are not
  invented). `peakHttpRps` and `peakSocketEventsPerSecond` are durable maxima.
- Socket event metrics count only incoming event names for which this server
  registered an application handler. Socket.IO transport ping/pong packets,
  connect/disconnect lifecycle events, unknown events, and server-to-client
  emits are excluded. Connections/reconnections remain only in
  `totalSocketConnections`.

`peakConcurrentParticipants` begins measuring accurately after this feature is
deployed. It cannot be reconstructed from older aggregate data, so no guessed
historic peak is stored.

## Persistence and restart behavior

`service_stats` is a singleton containing durable totals and peaks. HTTP,
socket-connection, and incoming application-event totals are accumulated in
memory and atomically incremented in batches;
peak rows are conditionally updated only when a new peak occurs. Current socket
and concurrent-participant values are intentionally process-memory values and
restart at zero on a Railway deployment.

`traffic_snapshots` records aggregate current counts and durable totals every
five minutes, plus the mean and maximum RPS/events-per-second across the
completed seconds in that five-minute interval. The interval is unref'ed so it cannot keep a test process alive.
SIGTERM/SIGINT attempts one final best-effort counter flush.

Railway's current single-instance deployment makes these current and rolling
metrics service-wide. With multiple instances, current values and one-minute
averages are per-instance; only the durable totals and maxima are shared.

## Admin API

`GET /api/admin/stats?hours=24&limit=288` requires the existing ADMIN JWT. The
response is wrapped as `{ data: { summary, snapshots } }`, following the other
admin APIs. Snapshots are limited to the requested recent period and at most 288
rows. The admin page shows the summary cards; it deliberately adds no chart
library.

## Migration and recovery

Run the normal migration command from the repository root:

```bash
npm run migrate --prefix backend
```

The original migration creates `service_stats` and `traffic_snapshots`; the
follow-up rate migration adds only the new counter and snapshot columns. A
database backup taken before migration can restore the new tables if necessary. Durable HTTP/socket totals and snapshots can be restored
from that backup; current connection counts and pre-deployment concurrent peaks
cannot be reconstructed.
