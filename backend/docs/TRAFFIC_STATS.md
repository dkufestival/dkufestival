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

`peakConcurrentParticipants` begins measuring accurately after this feature is
deployed. It cannot be reconstructed from older aggregate data, so no guessed
historic peak is stored.

## Persistence and restart behavior

`service_stats` is a singleton containing durable totals and peaks. HTTP and
socket totals are accumulated in memory and atomically incremented in batches;
peak rows are conditionally updated only when a new peak occurs. Current socket
and concurrent-participant values are intentionally process-memory values and
restart at zero on a Railway deployment.

`traffic_snapshots` records aggregate current counts and durable totals every
five minutes. The interval is unref'ed so it cannot keep a test process alive.
SIGTERM/SIGINT attempts one final best-effort counter flush.

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

The migration only creates `service_stats` and `traffic_snapshots`; it does not
alter existing tables. A database backup taken before migration can restore the
new tables if necessary. Durable HTTP/socket totals and snapshots can be restored
from that backup; current connection counts and pre-deployment concurrent peaks
cannot be reconstructed.
