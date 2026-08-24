# E2E Test Suite (Playwright)

End-to-end tests that drive the real Angular frontend against a real running backend — no mocks.

## Running locally

```bash
# From the repo root: build and start the full stack
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# From this folder
npm install
npx playwright install --with-deps chromium
npm test
```

Tear down afterwards with:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## Auth rate limiting

`/api/auth/*` is rate-limited server-side to 8 requests per 10 minutes per IP
(see `authLimiter` in [`Backend/index.js`](../Backend/index.js)). A single
full run of this suite makes ~4 auth requests, well under that limit — but
if you re-run the suite (or the Postman/Newman API tests) several times in
quick succession against the same backend instance, you can trip the limiter
and see tests fail with a stuck form / 429 response instead of a real
regression. If that happens, restart the backend container to clear the
in-memory limiter state:

```bash
docker restart sentiment-backend
```

## What's covered

`tests/auth.spec.ts` — registration, login (success + invalid credentials),
client-side validation, and route protection via `AuthGuard`.
