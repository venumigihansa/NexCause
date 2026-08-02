# NexCause Frontend Console

Modern TypeScript React console for the NexCause Kubernetes/RCA platform.

The app is a static Vite SPA served by unprivileged Nginx. In cluster, Nginx
serves the console and proxies:

- `/api/*` to Deployment Manager with `/api` stripped.
- `/auth/*` to Deployment Manager unchanged.

The browser never stores Asgardeo JWTs. It uses the Deployment Manager
HTTP-only session cookie and sends the CSRF token on unsafe API methods.

## Development

```bash
npm install
npm run dev
```

The Vite dev server proxies to `https://manager.rca.local`, which matches the
Kind Deployment Manager hostname.

## Checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Run `npx playwright install chromium` once before the first browser smoke test.
