# Changelog

## 0.1.3

- Same code as 0.1.1. Publish workflow upgrades the npm that setup-node installs (without sudo), so the release goes through the OIDC Trusted Publisher. 0.1.1 and 0.1.2 were never published.

## 0.1.2

- Same as 0.1.1 (never published: its CI run could not authenticate through OIDC). The publish workflow no longer writes an `.npmrc` token, so npm uses the Trusted Publisher.

## 0.1.1

- Homepage and credential documentation link point to the node's own page, https://traficora.com/integraciones/n8n.
- Released through npm Trusted Publishing (OIDC).

## 0.1.0

- Traficora node: Order, Trip, Trip Expense, Expiring Document, Vehicle and Customer resources over the Odoo JSON-2 API (`/json/2/<model>/<method>`) of the customer's own Traficora instance, with Simplify, offset pagination and module-aware default fields.
- Traficora Trigger (polling): New Order, Order Status Changed, Trip Finished and Document Expiring Soon, with a `write_date` / `create_date` cursor and a lookback window in the workflow's static data.
