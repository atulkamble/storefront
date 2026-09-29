# Commonplace Storefront

A full-stack homewares shop built with Next.js App Router, React, TypeScript, and SQLite.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. SQLite initializes at `data/commonplace.sqlite` and seeds the catalog on first run.

## Product pages and caching

Each item has a dynamic detail page at `/products/{id}`. Known product pages are prerendered and revalidated every 60 seconds; the catalog page revalidates every 5 minutes. Successful orders invalidate the shared product cache. The cart is stored in browser local storage so it survives navigation between product pages and the catalog.

## Store API

- `GET /api/products` returns the current catalog and stock.
- `POST /api/orders` validates customer details and stock, then records the order and decrements inventory in one transaction.
- `POST /api/auth/signup` creates an account and starts a session.
- `POST /api/auth/signin` verifies credentials and starts a session.
- `POST /api/auth/signout` ends the current session.
- `GET /api/auth/me` returns the current account, if signed in.

Accounts store a salted scrypt password hash, never the plaintext password. Session tokens are stored as hashes in SQLite and sent to the browser in an HttpOnly cookie.

Checkout is a demo flow and does not collect or process payment details. Production deployments need a persistent database and a configured payment provider.
