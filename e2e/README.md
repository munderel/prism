# Prism E2E Tests

Playwright + Chromium suite that drives the production deployment at `https://prism.upwhiten.com` under a dedicated test user.

## ⚠️ Important

These tests **write to the production database** under the test account. Every entity they create is prefixed with `[E2E <runId>]` so cleanup can find them, and the cleanup helper refuses to delete anything that doesn't match that prefix. If a run is interrupted, run `npm run e2e:nuke` to sweep leaks.

Do NOT log in as your real user during a test run.

## One-time setup

```bash
cd prism
npm install
npx playwright install chromium
```

Create a dedicated Google account for tests (e.g. `prism-e2e@…`) and invite it to your team on prism.upwhiten.com with normal-user permissions (some admin specs will be `test.skip` for non-admins; flip the test account to admin if you want full coverage).

## Capturing the session (one-time per ~25 days)

> Google blocks OAuth sign-in inside any Playwright-controlled browser ("This browser or app may not be secure"). To work around this, you sign in once in your real Chrome and we extract the session cookie.

1. Open your **normal Chrome** (not Playwright's). Go to `https://prism.upwhiten.com` and sign in with the dedicated test Google account. Land on the dashboard.
2. Open DevTools (`F12`) → **Application** tab → **Storage** → **Cookies** → `https://prism.upwhiten.com`.
3. Find the cookie named **`__Secure-next-auth.session-token`**. Click the row and copy the long JWT-like value from the **Value** column. *(Do not confuse with `csrf-token` or `callback-url`.)*
4. From `prism/`:

   PowerShell:
   ```powershell
   $env:SESSION_TOKEN="<paste>"; npm run e2e:auth
   ```
   bash:
   ```bash
   SESSION_TOKEN="<paste>" npm run e2e:auth
   ```

   (Or run `npm run e2e:auth` with no env var — it'll prompt you to paste.)

The script validates the cookie against `/api/stacks`, then writes `e2e/auth/storageState.json`. Refuses to write on validation failure.

## Running

```bash
# Full exhaustive suite (60–120 min, workers=1)
npm run e2e

# Smoke subset only (~10 min)
npm run e2e:smoke

# Open the last HTML report
npm run e2e:report

# Panic sweep — delete every [E2E*]-prefixed entity owned by the test user
npm run e2e:nuke
```

## Layout

```
e2e/
  playwright.config.ts        baseURL, storageState, projects (setup + chromium)
  auth/auth.setup.ts          manual-login bootstrap
  fixtures/                   test fixture, api client, test data factories
  helpers/                    cleanup, dates, waits, keyboard
  pos/                        one Page Object per route
  pos/components/             shared modal/component Page Objects
  specs/                      tests grouped by feature area
```

See `c:\Users\munde\.claude\plans\i-want-you-to-curried-piglet.md` for the full design.

## Selectors

The suite leans on roles/labels/text. A small set of `data-testid` attributes is required on these components for non-flaky tests — see the plan §9 for the list and add them in a separate PR before expecting the suite to be green.

## Safety net

Cleanup runs at three levels:

1. **Per-test** — every spec uses the `track` fixture; tracked entities are deleted via API in `afterEach`.
2. **Per-run** — at end of run, sweep `[E2E *]` rows that leaked.
3. **Manual** — `npm run e2e:nuke` for the panic button.

The cleanup helper hard-rejects any delete whose title doesn't match `/^\[E2E [a-z0-9]+\] /` — this is your circuit breaker if a test ever tracks a real entity by mistake.
