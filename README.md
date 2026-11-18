# @francodesystems-npm/n8n-nodes-traficora

[![npm version](https://img.shields.io/npm/v/@francodesystems-npm/n8n-nodes-traficora.svg)](https://www.npmjs.com/package/@francodesystems-npm/n8n-nodes-traficora)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> n8n community node for [Traficora](https://traficora.com), the Spanish TMS (transport management software) built on Odoo: transport orders, trips with their margin, trip expenses, expiring vehicle and driver documents, vehicles and customers.

This is an [n8n](https://n8n.io) community node that lets you use **your Traficora instance** in n8n workflows: create orders from emails, spreadsheets or a customer's system, follow them as they are planned, loaded and delivered, add fuel tickets and tolls to a trip, read the margin of each trip and get an alert before an ITV, insurance or driving licence expires. Built and maintained by [Francodesystems](https://francodesystems.com), the company behind Traficora.

It talks to the **Odoo JSON-2 API** (Odoo 19 and later) of your own instance. Nothing needs to be installed in Traficora.

📖 **Integrations**: [traficora.com/integraciones](https://traficora.com/integraciones)

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In your n8n instance: **Settings → Community Nodes → Install**, and enter:

```
@francodesystems-npm/n8n-nodes-traficora
```

The package has no runtime dependencies.

## Credentials

| Credential | Auth scheme | Notes |
|---|---|---|
| **Traficora API** | `Authorization: bearer <API key>` (+ `X-Odoo-Database` if set) | Tested with `POST /json/2/res.users/context_get` |

1. **Create the API key in Traficora.** Log in as the user the workflows will act as, then: your avatar (top right) → **My Preferences** (*Mis preferencias*) → **Account Security** (*Seguridad de la cuenta*) → **New API Key** (*Nueva clave API*). Confirm your password, give it a name such as `n8n`, choose how long it lasts and copy the key: it is shown only once. Since Odoo 19 keys have an expiry; create a new one before it runs out.
2. **Create the credential in n8n:**
   - **Base URL**: the address you open Traficora with, for example `https://empresa.traficora.com` (anything after the domain, such as `/odoo/...`, is ignored).
   - **API Key**: the key from step 1.
   - **Database**: leave it empty. It is only needed when the server hosts several databases.

The key acts as its user: the node can read and change exactly what that user can in Traficora. Use a user with access to Transport (and to Fleet for vehicles); for a read-only integration, a user with read-only rights is enough.

## Operations

| Resource | Operations |
|---|---|
| **Order** (*servicio*, `tms.order`) | Create (customer, customer reference, load and unload addresses and dates, goods, weight, packages, ADR, price, trip; optionally confirm it), Get, Get Many (filter by state, customer, load date from/to, customer reference, reference, trip, updated since), Update |
| **Trip** (*ruta*, `tms.trip`) | Get, Get Many (filter by state, vehicle, driver, departure date from/to, updated since). Returns revenue, direct expenses, cost per km, total cost, **margin** and **margin %**, fuel litres and consumption |
| **Trip Expense** (*gasto de ruta*, `tms.trip.expense`) | Create (fuel ticket with litres, toll, meal…: type, ticket total with VAT, optional amount without VAT, litres, supplier, paid by card / driver / supplier invoice, note), Get Many (filter by trip, vehicle, driver, type, date, paid by, fuel only) |
| **Expiring Document** (*caducidad*, `tms.expiry`) | Get Many (filter by state valid / expiring soon / expired, expiring within N days, vehicle, driver, document type; archived vehicles and drivers left out by default) |
| **Vehicle** (`fleet.vehicle`) | Get, Get Many (search by name or plate, driver, include archived) |
| **Customer** (`res.partner`) | Create (name, tax ID, email, phone, address, ISO country code, internal reference), Get Many (search by name / tax ID / email / reference; drivers left out by default) |

Which Traficora modules each one needs:

| Needs | Module |
|---|---|
| Orders, trips, vehicles, customers | TMS Base (`tms_base`), always installed |
| Trip expenses; margin, cost and fuel fields of trips and orders | Gastos y margen (`tms_cost`) |
| Expiring documents, Document Expiring Soon trigger | Caducidades (`tms_expiry`) |

Without `tms_cost`, trips and orders are returned without the margin fields (the node asks Odoo which fields exist). An operation on a model whose module is not installed fails with a message naming the module.

How the node uses the API:

- **Calls**: every operation is `POST {Base URL}/json/2/{model}/{method}` with the method's arguments as JSON: `search_read` (`domain`, `fields`, `offset`, `limit`), `read` (`ids`, `fields`), `create` (`vals_list`), `write` (`ids`, `vals`), `fields_get`, and `action_confirm` for **Confirm** on Order → Create. Create and Update return the record as read back from Traficora.
- **Pagination**: Get Many reads pages of 200 by offset. With **Return All** it reads every page; with a **Limit** it reads only what it needs.
- **Simplify** (on by default): Odoo returns a link to another record as `[id, name]`. Simplified, `partner_id: [7, "ACME"]` becomes `partner_id: 7` and `partner_name: "ACME"` (`vehicle_id` → `vehicle_name`, `trip_id` → `trip_name`, and so on), datetimes become ISO 8601 in UTC (`2026-11-18T08:30:00.000Z`) and empty values (`false` in Odoo) become `null`. Turn it off to get exactly what Odoo returns.
- **Fields**: each resource returns a useful default set. **Options → Fields** takes a comma-separated list of Odoo field names instead (technical names, visible in Traficora with developer mode on).
- **Dates**: dates you enter without a timezone are read in the workflow's timezone and sent to Odoo in UTC, as Odoo stores them.
- **Errors**: Odoo answers `{ "name", "message", "arguments", "debug" }` with an HTTP status. The node shows the message, and the error class plus a hint (expired key, missing module, no permission…) in the description. **Continue On Fail** is supported.
- **AI agents**: the Traficora node can be used as a tool by n8n AI agents.

Anything else in Traficora (invoices, DeCA, planning, workshop…) is reachable with the **HTTP Request** node: choose the **Traficora API** credential as predefined credential type and call `POST https://empresa.traficora.com/json/2/<model>/<method>`.

## Trigger

The **Traficora Trigger** node polls Traficora on the schedule you set (Odoo has no webhooks for these events):

| Event | Fires when | Output |
|---|---|---|
| **New Order** | An order is created | The order |
| **Order Status Changed** | An order moves to another state; optionally only to the states in **To States** (for example Delivered) | The order plus `previous_state` |
| **Trip Finished** | A trip is marked as done | The trip, with its margin when `tms_cost` is installed |
| **Document Expiring Soon** | A vehicle or driver document enters its notice period or expires (Traficora's own notice days per document type), or, with **Days Ahead** set, expires within that many days | The document, once per document and expiry date (a renewed document can fire again) |

How it works:

- The **first poll after activating** only records where things are (the latest `create_date` / `write_date` in Traficora and the current state of open orders and trips): nothing from before activation is emitted.
- Each poll reads records whose `write_date` (or `create_date` for New Order) is at or after the last one seen, minus a two-minute overlap, and skips the ones already emitted, so changes committed late or in the same second are not lost or duplicated. The cursor lives in the workflow's static data.
- State changes are detected by comparing with the last state seen. Changes made between two polls collapse into one (draft → confirmed → planned within one interval is reported as draft → planned).
- **Test** (manual execution) returns the latest matching record as a sample and stores nothing.

For a daily list rather than one alert per document, use a **Schedule Trigger** with **Expiring Document → Get Many** (see the example below).

## Compatibility

- Traficora on **Odoo 19 or later** (the JSON-2 API). Built against Traficora on Odoo 20.
- Requires n8n version **1.0** or later.
- Node.js **20.15+**.

## Usage

Example workflows to import are in [`examples/`](examples/).

### Daily expiring documents alert

```
Schedule Trigger (every day, 7:00)
  → Traficora (Expiring Document / Get Many, Expiring Within 30 days, Return All)
  → Code (one message: plate or driver, document, date, days left)
  → Send Email (or Telegram)
```

File: [`examples/daily-expiring-documents-alert.json`](examples/daily-expiring-documents-alert.json)

### New orders to Google Sheets

```
Traficora Trigger (New Order)
  → Google Sheets (Append Row: reference, customer, customer reference, load, unload, price)
```

File: [`examples/new-order-to-google-sheets.json`](examples/new-order-to-google-sheets.json)

### Orders from a customer's email

```
Email Trigger (IMAP)
  → AI Agent / Code (read the order)
  → Traficora (Customer / Get Many, Tax ID)
  → Traficora (Order / Create, Confirm)
```

### Fuel tickets from the driver's messages

```
Telegram Trigger (photo of the ticket)
  → AI (read total, litres, station)
  → Traficora (Trip / Get Many, vehicle, state In Progress)
  → Traficora (Trip Expense / Create, type Gasoil, litres)
```

## Development

```bash
npm install
npm run build      # tsc + icons
npm run lint       # eslint-plugin-n8n-nodes-base + n8n Cloud rules
npm test           # unit tests (node:test): bodies, domains, simplify, pagination, polling cursor, errors
npm run scan       # the static analysis of @n8n/scan-community-package on this checkout and its npm tarball
```

## Releasing (maintainers)

Same process as [n8n-nodes-holded](https://github.com/francodesystems/n8n-nodes-holded): releases are published by `.github/workflows/publish.yml` with an npm provenance attestation, as n8n requires for verified community nodes. See `VERIFICATION.md` for the checklist and the exact steps.

## Resources

- [Traficora integrations](https://traficora.com/integraciones)
- [Odoo external JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
