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
6. Start the app with `npm run dev`.

Seed rows are demonstration data, not imported operational data, and remain marked as sample data in the dashboard. Shopify order number is the shared key. SLA due timestamps are stored on each order because the brief calls out targets that may vary by market or service; agree the actual policy before connecting production sources.

## Included

- A 30-day overview of order volume, on-time-in-full (OTIF), dispatch SLA and support-contact rate.
- Delivery trend, lifecycle progress, separate factory/carrier scorecards and known refund/replacement costs.
- Searchable and status-filterable orders with shipped quantities and an auditable order timeline.
- PostgreSQL models for orders, line items, support contacts and source-attributed fulfilment events.

Live imports, SLA policy configuration, authentication and support-system integrations are intentionally outside this first slice.
