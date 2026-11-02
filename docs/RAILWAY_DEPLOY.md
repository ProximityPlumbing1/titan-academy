# Deploying on Railway

Follow `BUILD_INSTRUCTIONS.md` ("House conventions" and "Railway setup"). Summary:

1. **Project** `titan-academy` in the workspace "Proximity Plumbing's Projects". Environments:
   `production` and `staging`.
2. **Services**: `Postgres`, and `titan-academy` (web), built from the repo
   `ProximityPlumbing1/titan-academy` (repo root) with Railpack. `main` deploys to production
   and `staging` deploys to staging.
3. **Deploy settings**: start `npm run migrate && npm start`, health check `/health`, region
   `asia-southeast1`, **1 replica** (live classes hold state in one process).
4. **Variables**: `DATABASE_URL` (reference Postgres), `SESSION_SECRET`, `PUBLIC_URL`,
   `STAFF_DOMAIN=proximityplumbing.com.au`, `TZ=Australia/Sydney`, `NODE_ENV=production`,
   `GMAIL_SENDER`, `GOOGLE_SA_JSON`, `GOOGLE_CLIENT_ID`. Ask the owner before copying the Gmail
   and Google values from sales-pro.
5. **Domain**: the Railway domain first, then `academy.proximityplumbing.com.au` (ask first,
   because it needs a CNAME at the DNS provider). Update `PUBLIC_URL`, which invite links and
   certificate QR codes use.
6. **WebSockets** work on Railway out of the box. Use `wss://` on the same domain as the app.
7. **Retire Netlify** once production is confirmed: redirect the old site to the new domain.

## Headers
- Hashed assets: `Cache-Control: public, max-age=31536000, immutable`. `index.html` and the
  service worker: `no-cache`.
- CSP (self, Google Fonts, and the WebSocket origin), `X-Content-Type-Options`,
  `Referrer-Policy`, secure HTTP-only session cookies.
