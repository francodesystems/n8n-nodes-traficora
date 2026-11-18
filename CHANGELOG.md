# Changelog

## 0.1.0

- Traficora node: Order, Trip, Trip Expense, Expiring Document, Vehicle and Customer resources over the Odoo JSON-2 API (`/json/2/<model>/<method>`) of the customer's own Traficora instance, with Simplify, offset pagination and module-aware default fields.
- Traficora Trigger (polling): New Order, Order Status Changed, Trip Finished and Document Expiring Soon, with a `write_date` / `create_date` cursor and a lookback window in the workflow's static data.
