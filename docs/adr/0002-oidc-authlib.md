# ADR 0002: Core is our own OpenID Connect provider, built on Authlib

- Status: Accepted (implementation in Phase 1)
- Date: 2026-10-09

## Context

All apps need single sign-on, and Core must own users, organizations, memberships, plans and per-user module access. Books today issues its own HS256 tokens from one shared secret, with three separate login realms (tenant users, org admin panel, platform super admin). Every app that verifies an HS256 token must hold the secret that can also mint tokens.

Requirements:
- Existing Books users keep their email and password (bcrypt hashes).
- PKCE, `state` and `nonce` on every flow; refresh-token rotation with reuse detection; MFA for admins.
- Token claims carry `org_id`, `role`, `apps`, `modules` and `trial_ends_at`, so apps can enforce the plan without calling Core.
- Same stack as Books (FastAPI, SQLAlchemy, Alembic, Postgres).

## Decision

- Core implements the OIDC endpoints itself with **Authlib**'s server components: `/.well-known/openid-configuration`, `/authorize` (PKCE required), `/token`, `/userinfo`, `/jwks` and `/logout`.
- Access tokens are **RS256** JWTs (15 minutes). Apps verify them with Core's public keys from `/jwks` using `rooman_sdk.tokens.TokenVerifier`, so no app holds a signing secret. Keys carry a `kid` and are rotated with an overlap window.
- Refresh tokens are opaque, stored hashed, rotated on every use, and revoke the whole session family when one is reused (as Books does today).
- Passwords: existing bcrypt hashes are accepted, and new hashes use Argon2. A bcrypt hash is re-hashed with Argon2 on the next successful sign-in (passlib `CryptContext` with `deprecated="auto"`).
- Service-to-service calls (`/internal/...`) use the client-credentials grant with narrow scopes.

## Consequences

- No third-party identity server to run, patch or theme; the sign-in page is ours, with the per-org editable texts.
- We own security-critical code. It must be covered by tests for every flow and failure case, and reviewed before go-live (OWASP ZAP baseline, external review if budget allows).
- The SDK enforces the same 401/402/403 behaviour Books has today, so moving Books onto Core (Phase 2) changes where claims come from, not what users see.

## Alternatives considered

- **Keycloak.** Mature and feature-complete, but it is a Java service with its own database and admin UI, and our org, plan and module model would live in custom attributes and mappers. Theming and keeping the Books admin flows would cost more than building the subset we need.
- **Ory Hydra plus our own login and consent app.** A good split, but it adds another service and database, and we would still build the login, consent and user model ourselves.
- **Keep HS256 with a shared secret.** Any compromised app could mint tokens for every app. Rejected.
