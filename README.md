# Storefront

A full-stack homewares shop built with Next.js App Router, React, TypeScript, and SQLite.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. SQLite initializes at `data/commonplace.sqlite` and seeds the catalog on first run.

## Product pages and caching

Each item has a dynamic detail page at `/products/{id}`. Known product pages are prerendered and revalidated every 60 seconds; the catalog page revalidates every 5 minutes. Successful orders invalidate the shared product cache. The cart is stored in browser local storage so it survives navigation between product pages and the catalog.

## Offers and coupons

The Offers page is available at `/offers`. Current codes are `WELCOME10` (10% off $50+), `SLOW15` (15% off $100+), and `GATHER20` ($20 off $150+). Applying an offer stores it with the browser cart; checkout revalidates the code and minimum subtotal on the server. Orders persist subtotal, discount, coupon code, and final total.

## Store API

- `GET /api/products` returns the current catalog and stock.
- `POST /api/orders` validates customer details, stock, and coupon eligibility, then records the order and decrements inventory in one transaction.
- `POST /api/auth/signup` emails a signup verification code; pass `{ "resend": true, "email": "..." }` to resend after the cooldown.
- `POST /api/auth/verify-signup` verifies the emailed code, creates the account, and starts a session.
- `POST /api/auth/signin` verifies credentials and starts a session.
- `POST /api/auth/forgot-password` requests a short-lived email reset code without disclosing whether the account exists.
- `POST /api/auth/verify-password-reset` verifies the reset code, changes the password, revokes existing sessions, and starts a new session.
- `POST /api/auth/reset-password` verifies the signed-in user's current password, updates its hash, and revokes old sessions.
- `POST /api/auth/signout` ends the current session.
- `GET /api/auth/me` returns the current account, if signed in.

Accounts store a salted scrypt password hash, never the plaintext password. Session tokens are stored as hashes in SQLite and sent to the browser in an HttpOnly cookie.
Signup collects and stores a mobile number with the account; only the email address is verified by the signup code.
Signup codes expire after 10 minutes and are limited to five attempts. Email can be delivered by Amazon SES from Admin > AWS setup, or by Resend using `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. OTP signing and AWS credential encryption use an automatically generated application key stored at `data/.storefront-secrets-key`; keep that file in persistent storage with the SQLite database and protect backups.
Signed-in users can reset a password using the current password. Account recovery uses a 10-minute email code with five attempts and a resend cooldown.

Checkout is a demo flow and does not collect or process payment details. Production deployments need a persistent database and a configured payment provider.

## Admin dashboard

Open `/admin` to view customer accounts, orders, inventory alerts, and the activity audit trail. Local development defaults to username `admin` and password `admin`. Production requires `ADMIN_USERNAME` and a unique, strong `ADMIN_PASSWORD`; the development defaults are disabled in production. The audit trail records signup, sign-in/out, password reset, order placement, and admin login events. It does not record product browsing or cart changes, which remain browser-local.
AWS SES settings are available inside the admin dashboard. Enter credentials, region, output format, and verified SES sender, then save and test the identity. Credentials are encrypted in SQLite and never returned to the UI. Verify the SES sender identity and grant the credentials permission to read that identity and send email. The stored CLI output preference does not modify the host's AWS CLI files; the app uses the AWS SDK.
