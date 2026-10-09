# Runbook: rotating secrets

Secrets live in env files outside git: `/opt/roomanbooks/.env` on the Books host, and `infra/compose/.env` locally. They are never logged. Rotate them at least yearly, and immediately when someone with access leaves or a leak is suspected. Always take a backup first.

| Secret | Where | Effect of rotating | How |
|---|---|---|---|
| Books `SECRET_KEY` | Books `.env` | Signs Books access tokens. Every signed-in user must sign in again (refresh tokens are stored hashed and stay valid; the next refresh issues a new access token). | Generate a new value, update `.env`, then `docker compose -p roomanbooks up -d api`. Announce a short "please sign in again". |
| `POSTGRES_PASSWORD` (Books) | Books `.env` and the database | The API can't connect until both match. | `docker exec -it roomanbooks-db-1 psql -U roomanbooks -c "ALTER ROLE roomanbooks PASSWORD '<new>'"`, update `.env`, then restart `api`. Do it in a quiet window; it means a few seconds of 503s. |
| SMTP password | Books `.env` | Email stops until updated. | Create a new app password, update `.env`, restart `api`, then revoke the old one. |
| Razorpay keys | Books `.env`, written by the platform admin screen | Payments sync stops until updated. | Rotate in the Razorpay dashboard, enter in the super admin screen, then confirm a sync. The screen rewriting `.env` is a known issue, to be replaced by a secret store in Phase 1. |
| `NATS_PASSWORD`, Core and Bookings DB passwords | `infra/compose/.env` | Local only for now. | Update `.env`, then `docker compose up -d`. |

From Phase 1, Core's token-signing keys rotate with an overlap: a new key is published in `/jwks` first, used for signing a day later, and the old key is removed after the longest token lifetime. That procedure will be added here with the implementation.

## Leak response

1. Rotate the leaked secret now, using the steps above.
2. Check the audit log and access logs for use since the leak.
3. If it was committed to git, rotating is the fix. Rewriting history does not un-leak it. The gitleaks CI job should have blocked it; find out why it didn't.
