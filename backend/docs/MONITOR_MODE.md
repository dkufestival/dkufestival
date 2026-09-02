# Monitor mode

Set a long random `MONITOR_TOKEN` in the backend environment. Do not commit the
real value. Create the monitoring QR with this URL:

`https://<production-domain>/index.html?monitor=<MONITOR_TOKEN>`

The URL first exchanges the token for a short-lived monitor JWT. A monitor is
not a table or participant and is excluded from operational tables, sessions,
counts, chat, likes, board activity, staff-call records, and game scoring.
