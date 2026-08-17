# Multi-Location & Warehouse System — remaining work

The backend groundwork is already in place (master schema file, passive startup, TCP probe, database lock step, tightened read-only validator). Four user-facing pieces remain.

## 1. Step-by-step SSMS connection wizard

Rebuild the SQL connection dialog as a sequential 5-step flow with live per-step status (pending / running / passed / failed), elapsed time and a plain-language failure message with a fix hint:

```text
1 Credentials    server, instance, port, Windows or SQL auth
2 TCP socket     2s raw port probe -> "port closed or blocked" vs driver timeout
3 Auth handshake login against master, reports server name and version
4 Catalog        lists ONLINE databases the login can actually open
5 Lock & save    re-opens the pool on the chosen database and seals the config
```

Each step only unlocks after the one before it passes. A failed step can be retried on its own without re-running the whole wizard, and the exact error is shown next to the step that produced it.

## 2. Schema review & apply panel

In Local Database settings, add a "Database schema" card that reads `database/schema.sql` and shows the file path plus the tables it defines. Nothing runs automatically. An "Apply schema" button, confirmed through a dialog that states it only creates missing objects and never rewrites data, is the single way the file is executed. Result (applied / failed with the SQL error) is reported inline.

## 3. Launch boot check

A `LocationBootGuard` wrapped around the app shell. Once data has loaded, if there are zero active locations the app is blocked with a setup screen that explains the situation and links to Location Setup. The locations screen itself stays reachable so the operator can get out of the state. Admins see the create form directly; non-admins are told to contact an administrator.

## 4. Central-first inbound routing

Receiving in Purchasing splits into two explicit stages:

- **Receive into the hub** — every inbound invoice posts against the central warehouse (or the branch's own hub when no central location is configured), never straight to a shop floor.
- **Put away** — after posting, if the receiving location has sub-locations, a routing panel asks where each line goes. Assigning a line performs one atomic hub-to-sub-location movement (deduct hub, add sub) so stock is never counted twice or lost midway. Unassigned lines simply stay in the hub and remain visible as pending put-away.

## Technical notes

- Wizard uses the already-wired `sqladmin:probe-port`, `sqladmin:connect`, `sqladmin:databases` and `sqladmin:lock` IPC channels; no new backend work.
- Schema panel uses `pos:read-schema` / `pos:apply-schema`.
- Boot guard reads `activeLocations()` from `src/lib/locations.ts` against the loaded store list, mounted inside `AppShell` after the data-ready gate so it cannot flash during load.
- Put-away reuses the existing stock-adjustment path with a paired negative/positive movement and an audit log entry, so the transfer shows up in inventory history.
