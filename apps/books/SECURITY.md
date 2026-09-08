# Security

## Reporting a vulnerability

Email the maintainers privately rather than opening a public issue. Include the affected
endpoint or page, the steps to reproduce, and the impact you observed.

## What the application does

**Authentication.** Passwords are hashed with bcrypt. They must be 8 to 72 bytes with mixed
case and a digit; the upper bound is enforced because bcrypt ignores bytes past 72, which would
otherwise let a prefix of a long password authenticate. Access tokens are HS256 JWTs with a
30-minute default lifetime, held only in browser memory. The refresh token is a random opaque
value stored as a SHA-256 hash, delivered as an httpOnly, SameSite=Lax cookie scoped to
`/api/auth`, and rotated on every use. Changing a password revokes every other session.
Login and registration are rate limited per IP address, in the application and again in nginx.

**Authorization.** Three roles: `admin`, `staff` and `viewer`. Write routes depend on
`require_write`, administrative routes on `require_admin`, and the UI hides controls a role
cannot use. The API is the enforcement point; hiding a control is a convenience, not a control.

**Tenant isolation.** Every business table carries an `organization_id`, and every handler
resolves records through a helper that filters on the caller's organization. Cross-tenant reads
and writes return 404. This is covered by an explicit test.

**Input handling.** All request bodies are validated by pydantic models before a handler runs.
Database access goes through SQLAlchemy with bound parameters, so there is no string-built SQL.
Uploads are limited by type and size, stored under a per-organization directory with a generated
filename, and hashed with SHA-256 so tampering is detectable.

**Transport and headers.** The API sets `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and HSTS in production. CORS is an
explicit allow-list from `CORS_ORIGINS`, not a wildcard. Set `COOKIE_SECURE=true` when serving
over HTTPS.

**Auditing.** Logins, and every create, update and delete, are written to an audit log with the
acting user, entity and a summary. Financial documents are never silently mutated: voiding posts
a reversing journal entry instead of deleting history.

## Deployment requirements

- `SECRET_KEY` must be a high-entropy value supplied through the environment. The application
  refuses to start in production without it and never writes it to disk.
- Run behind TLS, set `COOKIE_SECURE=true`, and restrict `CORS_ORIGINS` to your own origin.
- Set `ALLOW_PUBLIC_SIGNUP=false` if only invited users should be able to join.
- Back up the database and the `DATA_DIR` volume, which holds uploaded documents.
- `/docs` and `/redoc` are disabled automatically in production.

## Known limits

- The login rate limiter is per process and in memory. Behind several API replicas, enforce the
  limit at the load balancer or move it to a shared store.
- Document uploads are stored on the local filesystem. Use a shared volume or object storage if
  you run more than one API instance.
- Multi-factor authentication and SSO are not implemented.
