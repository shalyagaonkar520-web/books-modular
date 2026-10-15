# Runbook: Core's signing keys and app credentials

Core signs every token with an RSA key. Apps (Books, Bookings…) get their own credentials, swap them at `POST /token` for a 15-minute token, and call Core's `/internal/...` API with it. Apps check Core's tokens against the public keys at `/jwks`.

## One-time setup (on the Core API host)

1. Make the key that encrypts the signing keys, and keep it in your password manager:
   ```bash
   docker run --rm rooman-core:<tag> python -m core_api.keys new-encryption-key
   ```
2. Add to Core's `.env`:
   ```
   PUBLIC_URL=https://id.<domain>             # the token issuer; apps must use exactly this
   KEY_ENCRYPTION_KEYS=<the key from step 1>
   ```
3. Apply the database change (adds `signing_keys`):
   ```bash
   docker run --rm --env-file /etc/rooman/core.env -v /etc/rooman/core-db.crt:/run/secrets/core-db.crt:ro rooman-core:<tag> migrate
   ```
4. Create Books' credentials. The secret is shown once:
   ```bash
   docker run --rm --env-file /etc/rooman/core.env -v /etc/rooman/core-db.crt:/run/secrets/core-db.crt:ro rooman-core:<tag> \
     python -m core_api.clients create --app books --scopes parties:write parties:read entitlements:read
   ```
   Put the printed `CORE_CLIENT_ID` and `CORE_CLIENT_SECRET` into Books' `.env`, together with `CORE_API_URL`.

The first token request creates the first signing key automatically.

## Rotating

| What | How | Effect |
|---|---|---|
| Signing key (e.g. yearly, or if leaked) | `python -m core_api.keys rotate` | The new key signs from now on. The old key keeps verifying for `SIGNING_KEY_OVERLAP_HOURS` (24 h), then drops out of `/jwks`. |
| An app's secret | `python -m core_api.clients rotate <client_id>` | The old secret stops working at once. Update the app's `.env` and restart it. |
| Disable an app | `python -m core_api.clients disable <client_id>` | It gets no new tokens. Tokens it holds expire within 15 minutes. |
| The encryption key | Put a new key **first** in `KEY_ENCRYPTION_KEYS`, keep the old one after it, restart, run `python -m core_api.keys rotate`, then remove the old key | Keys are re-encrypted as they are replaced. |

`python -m core_api.keys list` and `python -m core_api.clients list` show what exists.

## What the apps call

| Endpoint | Scope | Purpose |
|---|---|---|
| `POST /token` | | Client credentials → access token (HTTP Basic or form). 10 wrong secrets in 5 minutes from one address → 429. |
| `GET /jwks`, `/.well-known/openid-configuration` | | Public keys and discovery. |
| `POST /internal/parties` | `parties:write` | Find or create the shared customer. Matched by the app's own id, then email, then phone, always within one organization. |
| `PATCH /internal/parties/{id}` | `parties:write` | Update it (404 if it belongs to another organization). |
| `GET /internal/parties/{id}?org_id=` | `parties:read` | Read it. |
| `GET /internal/orgs/{id}/entitlements` | `entitlements:read` | Which apps and modules the organization has, and its subscription status. |

The calling app is taken from its token, never from the request. A missing or bad `KEY_ENCRYPTION_KEYS` or `PUBLIC_URL` answers 503 rather than issuing unsigned or wrongly signed tokens.

## User sign-in (single sign-on)

People sign in once at `https://id.<domain>/signin` and every app trusts that. It uses the OpenID Connect code flow with PKCE:

1. The app sends the browser to `/api/oauth/authorize`.
2. The person signs in at `/signin`, and picks an organization if they belong to several.
3. Core sends the browser back to the app with a one-time code (60 seconds).
4. The app swaps the code at `/api/oauth/token` for:
   - an **access token**: 15 minutes, its audience is that app, and it carries role, apps, modules and trial status as `rooman_sdk.tokens` expects;
   - an **ID token**;
   - a **refresh token**: 30 days, replaced on every use.

Register each app that signs people in:
```bash
# Browser app (PKCE only, no secret)
python -m core_api.clients create-web --app books --redirect-uri https://books.<domain>/auth/callback --public
# Or a server-side app that can keep a secret
python -m core_api.clients create-web --app books --redirect-uri https://books.<domain>/auth/callback
```

| Protection | What it does |
|---|---|
| Exact return address | The redirect URI must match a registered one exactly. An unknown app or address shows an error page and never redirects. |
| PKCE S256 | Required on every request. The code works once, and only with the verifier and redirect URI it was issued for. |
| Code replay | Exchanging a used code is refused and revokes the tokens that code produced. |
| Refresh rotation | Each refresh token works once. Reusing an old one revokes its whole family (assumed stolen). |
| Wrong passwords | 5 in a row lock the account for 15 minutes; failures per address are rate limited. Unknown email and wrong password get the same answer. |
| Sign-out | `/api/oauth/logout` ends the Core session and every refresh token it produced. |
| Session cookie | `rooman_sid`: HttpOnly, SameSite=Lax, scoped to `/api/oauth`, Secure outside development. Only its SHA-256 is stored. |
| Sign-in page calls | Must carry the `X-Rooman-Signin` header, so other sites cannot post to them. |
| Access to organizations | Only active memberships in active organizations. A suspended organization or a disabled user cannot sign in, and a refresh fails once access is removed. |

Settings (all optional): `USER_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `SESSION_HOURS`, `AUTH_CODE_SECONDS`, `MAX_FAILED_LOGINS`, `LOCKOUT_MINUTES`, `COOKIE_SECURE`.

Not yet included: MFA, password reset and invitations at Core (Books still handles these), and per-organization sign-in texts.
