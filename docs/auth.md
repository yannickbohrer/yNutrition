# Auth

**Key files:** `src/lib/server/auth/` (`webauthn.ts`, `session.ts`, `setup.ts`, `tokens.ts`),
`src/hooks.server.ts`, `src/routes/api/auth/`, `scripts/recovery.js`

Passkeys only (WebAuthn, discoverable credentials). No passwords, one user.

## First run

When no passkey exists, the app prints a setup link on start:

```
[nutrition] No passkey registered yet. Open this link to set up your passkey:
  https://nutrition.example.com/setup?token=…
```

The token is `SETUP_TOKEN` if set, otherwise random. It's only valid while no passkey exists.

## Recovery

Lost every device? Print a one-time registration link, valid for 1 hour:

```sh
docker compose exec app node scripts/recovery.js        # or: npm run recovery (local)
```

The last passkey can't be deleted in the UI, which prevents locking yourself out.

## Sessions

256-bit random cookie, stored as HMAC(`SESSION_SECRET`). 90 days, extended at most once a day.
`HttpOnly`, `Secure`, `SameSite=Lax`. Changing `SESSION_SECRET` logs every device out.

## Things that break passkeys

- **`RP_ID` and `ORIGIN`** must match the public URL exactly. Passkeys are bound to `RP_ID`: if
  you move the app to another domain, existing passkeys stop working (use the recovery link on the
  new domain).
- **No HTTPS.** Browsers allow WebAuthn only on HTTPS or `localhost`.
- **Proxy headers.** The rate limit uses the client IP from `X-Forwarded-For` (last hop,
  `XFF_DEPTH=1`). Without the proxy setting this header, all clients share one bucket.
