# Database migrations

NivasaOS has one runtime migration owner: `lib/schema/migrate.js`.

Application startup and the explicit operator command both call the same ordered registry. Individual migration modules remain implementation units and may be exercised directly by focused tests, but they do not define runtime order independently.

## Registry and ledger

The registry currently applies:

1. core schema;
2. security contracts;
3. legacy compatibility migrations;
4. release integrity contracts;
5. workspace localization;
6. money precision and minor-unit mirrors.

Each successful migration is recorded in `schema_migrations` with:

- migration ID;
- application version;
- applied timestamp;
- measured duration.

Migration IDs are unique, ordered, versioned strings. A completed ID is not executed again.

## Operator command

For a non-container installation:

```bash
bun run migrate
```

For Compose:

```bash
docker compose exec nivasaos bun run migrate
```

The command is safe to repeat. It prints either the newly applied IDs or that the database is current.

Normal application startup also runs the same registry before serving database-backed requests. The explicit command is useful during controlled maintenance windows and release rehearsals.

## Failure behavior

A migration is written to the ledger only after its apply function returns successfully. A failed migration remains pending and the process exits with an error.

Migration modules must remain idempotent because SQLite DDL and existing compatibility migrations may partially complete before a process interruption. NivasaOS does not pretend that every SQLite schema change can be transactionally rolled back. Before any schema-sensitive update:

1. stop the application;
2. create and verify a backup;
3. run the migration command;
4. run SQLite integrity checks and application gates;
5. restore the pre-update backup if acceptance fails.

## Concurrency boundary

The migration registry is designed for the documented single-instance SQLite architecture. It is not a distributed migration coordinator.

Do not start multiple application replicas against the same database during an upgrade. Stop the old process, migrate once, then start the new process.

## Verification

`bun run verify:migrations` creates isolated databases and proves:

- the complete ordered plan applies;
- a second run is a no-op;
- ledger metadata is recorded;
- money mirrors are present;
- SQLite `quick_check` succeeds;
- a failed migration is not marked complete;
- duplicate migration IDs are rejected;
- `lib/db.js` delegates migration ownership to the central registry.

The container gate additionally verifies that the migration ledger exists and survives restart in the persistent database volume.
