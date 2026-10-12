# Parcel — order fulfilment reporting

A compact Next.js, Prisma and PostgreSQL application for following Shopify orders through factory handling, carrier delivery and customer support. The overview separates factory dispatch performance from carrier delivery performance and links reported issues to their order.

## Preview with sample records

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Leave `DASHBOARD_DEMO_MODE="true"` for a labelled preview.
4. Start the app with `npm run dev`.

Sample mode is an explicit UI-preview setting. It does not query PostgreSQL or imply that Shopify, a factory, a carrier or a support platform is connected.

## Run against PostgreSQL

1. Start the local database with `docker compose up -d postgres`.
2. Copy `.env.example` to `.env`; keep `DATABASE_URL` and set `DASHBOARD_DEMO_MODE="false"`.
3. Install dependencies with `npm install`.
4. Apply the checked-in migrations and generate the Prisma client with `npm run db:migrate`.
5. Load clearly labelled example records into an empty database with `npm run db:seed`. The command refuses to run if the database already contains orders.
6. Create the first admin with `npm run admin -- you@example.com` (prompts for name and password).
7. Start the app with `npm run dev` and sign in.

Seed rows are demonstration data, not imported operational data, and remain marked as sample data in the dashboard. Shopify order number is the shared key. SLA due timestamps are stored on each order because the brief calls out targets that may vary by market or service; agree the actual policy before connecting production sources.

## Included

- A 30-day overview of order volume, on-time-in-full (OTIF), dispatch SLA and support-contact rate.
- Delivery trend, lifecycle progress, separate factory/carrier scorecards and known refund/replacement costs.
- Searchable and status-filterable orders with shipped quantities and an auditable order timeline.
- PostgreSQL models for orders, line items, support contacts and source-attributed fulfilment events.

## Users and sign-in

Every page requires sign-in. All users are admins for now; any admin can add users, set new passwords and delete users on the Users page. Sessions last 7 days and are stored in the `Session` table, so deleting a user or resetting their password signs them out.

**Lost admin password:** run `npm run admin -- you@example.com` with `DATABASE_URL` pointing at the database (for Railway, use the Postgres `DATABASE_PUBLIC_URL`, or `railway run npm run admin -- you@example.com`). It resets the password and signs out that user's sessions, or creates the admin if the email doesn't exist.

Sample mode (`DASHBOARD_DEMO_MODE="true"`) has no database and skips sign-in; it only ever shows sample data.

## Shopify order import

Admins add stores on the **Stores** page (Shopify domain, optional custom domain, and SLA days). Each store needs its own app made in the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) with **custom distribution**, scope `read_orders`, redirect URL `APP_URL/api/shopify/callback`. Paste the app's Client ID and secret, click **Connect**, approve in Shopify. Custom-distribution apps get customer name/email access automatically; if imported orders show "Unknown customer", that access is missing.

- New and updated orders are fetched every `SHOPIFY_SYNC_HOURS` (default 3) by an in-process timer, plus a **Sync now** button. The first sync covers the last 60 days (Shopify's limit for `read_orders`).
- An order is identified by store + Shopify order ID (a database unique key), so re-syncing updates it instead of duplicating it.
- App secrets and tokens are encrypted with `ENCRYPTION_KEY`. Use the same key on every machine that shares the database.
- Shopify has no factory data, so imported orders start with factory "Unassigned"; pick/pack timestamps stay empty. Carrier collection is taken from the fulfillment time and delivery from Shopify's delivered status.

Support-system integrations are intentionally outside this slice.
