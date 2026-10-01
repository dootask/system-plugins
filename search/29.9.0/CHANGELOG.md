# 29.9.0

## Engine

- Upgraded Manticore Search to 29.9.0. Existing 28.4.4 data is read as-is: no data wipe, no re-embedding, no full rebuild.
- Fixed the engine crash-looping after an unclean shutdown or host reboot, which the status panel showed as "Table missing". Cause: the binlog metadata referenced a log file that no longer existed, so the engine exited with a FATAL on every start while the tables themselves were intact. The engine now skips missing binlog files (`--replay-flags=ignore-open-errors`) and still replays the remaining logs, so unflushed writes are kept.
- As a fallback, if the previous start still failed on a corrupted binlog, the startup script moves the binlog directory aside as `binlog.corrupt-<time>` (latest 3 kept) and starts again. Writes that were only in that binlog are dropped; the main app resyncs them from the source data.
- The engine now gets 120 seconds to shut down, so large indexes can flush to disk instead of being killed after Docker's default 10 seconds.
- The container health check now probes without TLS negotiation. On one freshly upgraded engine container the MySQL port advertised SSL but failed the handshake ("SSL connection error"), so a working engine showed as unhealthy. It did not reproduce after a reinstall and the cause is unknown; plain connections and the unix socket were never affected.

## Search Status panel

- The coverage table now tells the causes apart: "Engine offline", "Table not loaded" (engine up but the table fails to serve) and "Table missing" (the table really does not exist), instead of showing "Table missing" for every failure.
- Administrators now also get the red-dot alert when a table is not loaded.
- The failure queue gets a "Clear…" dropdown to clear everything or a single type, with a confirmation. Clearing gives up on those records: the data will not be written to the search index automatically again and can only be recovered by refilling the index, which is very costly for messages. Use it to cut losses when the backlog is huge.
- The failure queue header now shows an estimated time to drain at the default retry pace (100 per 2 minutes); records that keep failing back off, so the real time can only be longer.

## Notes

- Upgrade is tested from 28.4.4 only. Downgrading to an older engine after the data has been opened by 29.x is not supported.
