# Sign in with Rooman One — guide for Rooman Billing

For the Rooman Billing developers. It describes the change Billing needs so that:

1. **One login:** someone signed in at Rooman One (`https://roomanone.futureacad.ae`) opens Billing without a second password.
2. **Same people, same ids:** the Billing user and organization carry the **same ids** as in Rooman One.
3. **No second registration:** an organization created on Rooman One is set up in Billing automatically the first time someone from it opens Billing.

Billing's own email/password login and sign-up stay exactly as they are. Everything below is **off until the `OIDC_*` settings are set**.

**Working example:** Rooman Books already does all of this, and it is live. Copy its approach and its tests:
- `apps/books/backend/routers/rooman_one_login.py`: start, callback, token checks, setup on first sign-in.
- `apps/books/tests/test_rooman_one_login.py`: 12 tests covering forged tokens, replay, wrong org, unknown user, open redirect and first sign-in.
- `apps/books/backend/services/org_setup.py`: one shared "create organization" used by both sign-up paths.

---

## 1. What Rooman One provides

| | |
|---|---|
| Issuer | `https://roomanone.futureacad.ae` |
| Discovery | `https://roomanone.futureacad.ae/api/oauth/.well-known/openid-configuration` |
| Flow | Authorization code + **PKCE (S256)**, confidential client (client id + secret) |
| Scopes | `openid profile email` |
| Signing | RS256; keys at the discovery document's `jwks_uri` |

The **id_token** (verify it, and never trust anything unverified) carries:

| Claim | Meaning |
|---|---|
| `sub` | Rooman One user id (UUID with dashes; Billing's `String(36)` ids can use it as is) |
| `org_id` | The organization the person chose (UUID with dashes) |
| `org_name` | That organization's name |
| `role` | Their role there: `admin`, `staff`, `viewer` … |
| `email`, `name` | Verified email (lower-case) and display name |
| `nonce` | Must equal the nonce Billing sent |
| `iss`, `aud`, `exp`, `iat` | `iss` = issuer above, `aud` = Billing's client id |

## 2. New settings (`.env.production`)

```
OIDC_ISSUER=https://roomanone.futureacad.ae
OIDC_CLIENT_ID=billing-web-…        # we register Billing and send you these two
OIDC_CLIENT_SECRET=…
OIDC_REDIRECT_URI=https://<billing host>/api/v1/auth/rooman-one/callback
```

## 3. Backend: four endpoints under `/api/v1/auth/rooman-one`

### `GET /api/v1/auth/rooman-one`
Returns `{"enabled": true|false}` (true when issuer and client id are set). The login page uses it to decide whether to show the button.

### `GET /start?next=/path`
- Make `state`, `nonce` and a PKCE `verifier` (`secrets.token_urlsafe`), with `code_challenge = base64url(sha256(verifier))`.
- Keep them in a **short-lived httpOnly cookie** (10 minutes, `SameSite=Lax`, `Secure`, `Path=/api/v1/auth/rooman-one`), sealed with HMAC over `SECRET_KEY`. See `seal`/`unseal` in the Books file.
- Only accept `next` values that start with `/`. Reject `//…` and `\` (no open redirect).
- 303 redirect to the discovery document's `authorization_endpoint` with `client_id, redirect_uri, response_type=code, scope, state, nonce, code_challenge, code_challenge_method=S256`.

### `GET /callback?code=…&state=…`
1. Unseal the cookie and compare `state` with `hmac.compare_digest`. If it is missing or mismatched, go back to login with "please try again".
2. POST to the `token_endpoint` (form): `grant_type=authorization_code, code, redirect_uri, code_verifier, client_id, client_secret`.
3. Verify the `id_token` with PyJWT and `PyJWKClient(jwks_uri)`: `algorithms=["RS256"]`, `audience=OIDC_CLIENT_ID`, `issuer=OIDC_ISSUER`, `leeway=60`, and require `exp, iat, sub, iss, aud`. Then check the `nonce`.
4. Find or set up the person (section 4).
5. Run **the same checks as `login`**: user active, active membership, organization status (pending, suspended …). If the user has **TOTP on**, return Billing's existing MFA challenge instead of tokens, exactly as `login` does.
6. Issue Billing's normal session with `issue_tokens(db, user, membership, ip, user_agent)`, write a `USER_LOGGED_IN` audit entry (with `"via": "rooman_one"`), and commit.
7. **Hand-over.** Billing keeps tokens in the browser's `localStorage`, so they cannot be set as a cookie. Instead:
   - Encrypt the `TokenBundle` with your existing encryption helper (`ENCRYPTION_KEYS`), with a **60-second expiry** and a random id.
   - Redirect (303) to `{FRONTEND_URL}/auth/rooman-one#handoff=<encrypted>`. The `#` part is never sent to servers or written to logs.
   - On any failure, redirect to `{FRONTEND_URL}/login?sso_error=<message>` instead.

### `POST /exchange` — body `{"handoff": "…"}`
Decrypt, check the expiry, and **use it once**: record the random id, for example in Redis with a 60-second expiry. Return the usual `AuthTokens`.

## 4. First sign-in: set up what Billing hasn't seen

In the callback, after verifying the token:

```text
user = db.get(User, claims["sub"])
if user is None:
    email = claims["email"]
    if get_user_by_email(db, email) exists:            # Billing emails are unique
        -> refuse: "This email already has its own Rooman Billing account.
                    Sign in to Billing with your email and password."
    org = db.get(Organization, claims["org_id"])
    if org is None:
        org = create organization (id = claims["org_id"], name = claims["org_name"])
              exactly as self-service sign-up does
    user = User(id=claims["sub"], email=email, full_name=claims["name"],
                hashed_password=None, is_active=True, email_verified_at=now)
    membership = Membership(org, user, role=<map claims["role"]>, status=ACTIVE, accepted_at=now)
    commit   # so an organization waiting for approval is kept for the platform admin
elif user's membership org != claims["org_id"]:
    use/create the membership for claims["org_id"], or refuse ("different organization")
```

- **Do not duplicate the sign-up logic.** Move the organization part of `auth_service._create_verified_signup` (the `Organization(...)` with slug, ACTIVE status, trial dates, and the `ORGANIZATION_CREATED` / `ORGANIZATION_TRIAL_STARTED` platform audit entries) into one function, for example `create_organization(db, name, owner, *, organization_id=None, now)`. Call it from both paths, as Books did with `services/org_setup.py`.
- **Role mapping:** the person who created the organization (role `admin`, new organization) becomes `OWNER`. Other `admin`s become your admin role, and `staff`/`viewer` your nearest roles. Unknown roles get your least-privileged member role.
- **`hashed_password=None`:** these people sign in with Rooman One. They can add a Billing password later with "Forgot password".

## 5. Frontend

- **Login page:** call `GET /api/v1/auth/rooman-one`. If enabled, show a **"Sign in with Rooman One"** button that navigates to `/api/v1/auth/rooman-one/start?next=<where they were going>`. Show `?sso_error=` as the page's error message.
- **New route `/auth/rooman-one`:**
  1. Read `handoff` from `window.location.hash`.
  2. Remove it straight away with `history.replaceState`.
  3. POST it to `/api/v1/auth/rooman-one/exchange`.
  4. Store the tokens with the same function the password login uses.
  5. Navigate to the dashboard. On error, go to `/login?sso_error=…`.

## 6. Tests to write (mirror the Books ones)

- Off until configured: the status call returns `enabled: false`, and `/start` returns 404.
- `/start` redirects to Rooman One with PKCE S256 and sets the flow cookie.
- Full sign-in for an existing user ends in a working Billing session.
- **Refused:**
  - a token signed by another key;
  - the wrong `aud`;
  - the wrong `iss`;
  - a replayed `nonce`;
  - a forged or missing `state`;
  - an expired or reused hand-over.
- `next` cannot point outside Billing.
- First sign-in creates the organization (same id, trial, audit entries) and the owner. A colleague joins with the mapped role. An existing email is refused, not duplicated.
- A TOTP user still gets the MFA challenge.

## 7. What we do on the Rooman One side

When your change is ready (or before, so you can test against it), we:
1. Register Billing: `python -m core_api.clients create-web --app billing --redirect-uri https://<billing host>/api/v1/auth/rooman-one/callback`, then send you the client id and secret securely.
2. Add the `billing` app, and an **Open Rooman Billing** button on Rooman One's page (`APP_LINKS`).
3. Give new Rooman One organizations Billing (`SIGNUP_APPS=books,billing`).

Questions: ask the Rooman One team. The Books implementation above is the reference.
