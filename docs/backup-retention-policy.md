# Backup and Retention Policy

Last updated: 2026-02-21

## Scope

This policy covers:

- File-based seed content in `data/content/*`
- Cloudflare D1 databases:
  - `metro-atl-transit-prod`
  - `metro-atl-transit-staging`

`data/content/*` is the bootstrap source for empty databases; D1 is the runtime source of truth after initial seeding.

## Recovery Targets

- RPO (maximum acceptable data loss):
  - D1 logical rollback (time-travel): 1 hour
  - D1 catastrophic restore (from export): 24 hours
  - `data/content/*`: 24 hours
- RTO (maximum acceptable time to recovery): 4 hours for production restore

## Backup Frequency and Retention

| Asset | Backup Method | Frequency | Retention |
| --- | --- | --- | --- |
| `data/content/projects.json`, `data/content/goals.json`, `data/content/history.json` | Snapshot JSON files + SHA256 manifest | On every merge to `main` and nightly at 02:00 UTC | 30 daily, 12 weekly, 12 monthly |
| `metro-atl-transit-prod` (D1) | SQL export via Wrangler | Nightly at 02:15 UTC | 35 daily, 26 weekly, 12 monthly |
| `metro-atl-transit-staging` (D1) | SQL export via Wrangler | Nightly at 02:30 UTC | 14 daily, 8 weekly |
| `metro-atl-transit-prod` (D1) | Cloudflare D1 Time Travel | Continuous platform feature | Native 30-day window (platform limit) |

## Storage and Access Rules

- Store backups in encrypted object storage with versioning enabled.
- Restrict backup read access to maintainers responsible for incident response.
- Keep at least one off-site copy separate from the deployment environment.
- Do not commit backup artifacts to git history.

## Runbook: Backup Commands

### D1 export (production)

```bash
npx wrangler d1 export metro-atl-transit-prod --remote --output backups/d1/prod/metro-atl-transit-prod-YYYYMMDD-HHMM.sql
```

### D1 export (staging)

```bash
npx wrangler d1 export metro-atl-transit-staging --env staging --remote --output backups/d1/staging/metro-atl-transit-staging-YYYYMMDD-HHMM.sql
```

### Optional content-only export (faster, for frequent snapshots)

```bash
npx wrangler d1 export metro-atl-transit-prod --remote --no-schema --output backups/d1/prod/metro-atl-transit-prod-content-YYYYMMDD-HHMM.sql
```

## Runbook: Restore Procedures

### 1) Single-item restore (accidental archive)

Use existing API endpoints:

- `POST /api/projects/:id/restore`
- `POST /api/goals/:id/restore`

This is the fastest path when the record exists and was only archived.

### 2) Point-in-time restore (within 30 days)

Use this for bad writes/deletes that occurred recently.

1. Freeze writes (temporarily deny editor access or write routes).
2. Take a forensic snapshot before rollback:
   ```bash
   npx wrangler d1 export metro-atl-transit-prod --remote --output backups/d1/prod/pre-restore-YYYYMMDD-HHMM.sql
   ```
3. Inspect time-travel point:
   ```bash
   npx wrangler d1 time-travel info metro-atl-transit-prod --timestamp 2026-02-21T15:00:00Z
   ```
4. Restore:
   ```bash
   npx wrangler d1 time-travel restore metro-atl-transit-prod --timestamp 2026-02-21T15:00:00Z
   ```
5. Validate `/api/projects`, `/api/goals`, and `/api/history`.
6. Re-enable writes.

### 3) Full restore from SQL export (older than 30 days or severe corruption)

Use this when time travel cannot reach the target point.

1. Freeze writes.
2. Create a recovery database:
   ```bash
   npx wrangler d1 create metro-atl-transit-prod-recovery-YYYYMMDD
   ```
3. Import backup:
   ```bash
   npx wrangler d1 execute metro-atl-transit-prod-recovery-YYYYMMDD --remote --file backups/d1/prod/<backup-file>.sql
   ```
4. Update `wrangler.jsonc` production `d1_databases[].database_id` to the recovery DB ID.
5. Deploy:
   ```bash
   npm run deploy
   ```
6. Run smoke/integration checks and confirm admin/history behavior.
7. Re-enable writes.

### 4) Restore `data/content/*`

1. Recover the target file set from backup storage or git commit.
2. Validate JSON syntax before commit/deploy.
3. Commit restored content and deploy.
4. If needed, reseed a new local DB with migrations and verify reads.

## Validation and Drill Schedule

- Weekly: verify backup jobs completed and checksums match.
- Monthly: restore latest production export into a disposable D1 DB and run smoke tests.
- Quarterly: perform full incident simulation (write freeze, restore, validation, recovery report).

## Incident Logging

For any restore event, log:

- Incident start/end timestamps
- Chosen restore point and reason
- Commands executed
- Validation results
- Follow-up actions to prevent recurrence
