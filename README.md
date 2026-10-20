# DIDEBAN Phase 2D.5 — Security Audit Trail

Copy the `src` tree into the existing repository (preserve other files). Full versions of the three modified files are included.

New files: `Security/Audit/SecurityAuditStore.cs`, `Security/Audit/SecurityAuditMiddleware.cs`, `Controllers/SecurityAuditController.cs`.
Modified full files: `Program.cs`, `Controllers/AuthController.cs`, `Controllers/IdentityManagementController.cs`.

Run `dotnet build` then `dotnet run`. The audit store schema is initialized idempotently at startup, in a separate SQLite database. By default this database is under the API content root `data/dideban_security_audit.db`. To configure the repository data directory, add `SecurityAudit:DatabasePath` in `appsettings.Development.json`.

Test with fresh admin JWT:
- POST `/api/auth/login` -> Auth.LoginSucceeded event
- GET `/api/security-audit/events` -> 200
- GET `/api/security-audit/verify` -> valid=true
- GET `/api/security-audit/events` with Viewer JWT -> 403
- GET `/api/model-registry/models` with Viewer JWT -> 403, then admin events shows Auth.AccessDenied

Important: SHA-256 hash chaining detects changes to existing records but cannot independently prove that the entire database was not replaced. Production should anchor signed checkpoints outside the database, add retention/backups, and test concurrent multi-process writers. Writes after management changes are best-effort in terms of atomicity across the separate DBs: audit write failures surface errors after the identity mutation. Plan an outbox for production.

No plaintext passwords, JWTs, request bodies or query strings are logged. Failed login attempts are not linked to a supplied username to avoid storing personal data.
