# n8n verified community node: checklist

Status of `@francodesystems-npm/n8n-nodes-traficora` 0.1.0 against n8n's requirements, checked on 18 Nov 2026 against
[Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/) and
[Verification guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/).

Legend: ✅ done and checked · ⏳ needs Juan (account, network or publishing) · ℹ️ note

## Package

| Requirement | Status | Evidence |
|---|---|---|
| Name starts with `n8n-nodes-` or `@scope/n8n-nodes-` | ✅ | `@francodesystems-npm/n8n-nodes-traficora` (same scope as holded, decafirma and sourevo) |
| Keyword `n8n-community-node-package` | ✅ | `package.json` → `keywords` |
| Nodes and credentials listed under `n8n` | ✅ | `n8n.nodes` (Traficora, TraficoraTrigger), `n8n.credentials` (TraficoraApi), `strict: true` |
| MIT licence | ✅ | `LICENSE`, `license: "MIT"` |
| No runtime dependencies | ✅ | No `dependencies`; only `devDependencies` and the `n8n-workflow` peer. Code imports only `n8n-workflow` |
| `files` only ships `dist` | ✅ | Tarball: `dist/`, `package.json`, `README.md`, `LICENSE`, `index.js` (50 files, 41 kB) |
| `homepage`, `author`, `repository`, `bugs` | ✅ | homepage `https://traficora.com/integraciones`; repository `github.com/francodesystems/n8n-nodes-traficora` (to be created) |
| `@n8n/node-cli` ≥ 0.23.0 as devDependency | ✅ | `^0.23.0` |
| npm repository URL matches a public GitHub repo; same author/maintainer on npm and GitHub | ⏳ | The repo does not exist yet (step 1 below) |

## Code and lint

| Requirement | Status | Evidence |
|---|---|---|
| TypeScript, n8n node conventions | ✅ | Programmatic action node + polling trigger |
| `npm run lint` passes | ✅ | `eslint-plugin-n8n-nodes-base` + `@n8n/eslint-plugin-community-nodes` (n8n Cloud rules): 0 errors, 0 warnings |
| `npx @n8n/scan-community-package` static analysis | ✅ (locally) | `npm run scan` (scanner v0.43.0 rule set) on the source and on the `npm pack` tarball: **both passed**. The real command also checks npm provenance, so it can only be run after step 3 |
| No env vars, no file system access | ✅ | No `process`, `fs`, `__dirname`; the base URL comes from the credential |
| No restricted globals | ✅ | Enforced by `lint:cloud` and the scan |
| Errors wrapped in `NodeApiError` / `NodeOperationError` with `itemIndex` | ✅ | Odoo's `{ name, message, arguments, debug }` becomes the message, plus the error class and a hint (expired key, missing module, no permission) in the description |
| Continue On Fail and `pairedItem` | ✅ | Every output item carries `pairedItem: { item: i }` |
| `usableAsTool` | ✅ | `true` on the action node, `false` on the trigger |
| Icons: SVG, light and dark variants | ✅ | `traficora.svg` / `traficora.dark.svg`. ℹ️ Juan: have a look at both in the n8n editor before submitting |
| Credential: password field, `test` request, documentation URL | ✅ | `apiKey` is `password`; test = `POST /json/2/res.users/context_get`; docs `https://traficora.com/integraciones` |
| Trigger: name ends in `Trigger`, `inputs: []`, polling with static data | ✅ | `polling: true`; `write_date` / `create_date` cursor with a lookback window; first run sets the cursor without emitting, manual run returns a sample |
| English only (UI, errors, README) | ✅ | |
| Unit tests | ✅ | `npm test`: 37 tests (`node:test`): body building, domains, Simplify, pagination, base URL normalisation, error parsing and the polling cursor |

## UX

| Guideline | Status | Notes |
|---|---|---|
| Resources and operations, "Get Many", sentence-case actions, alphabetical options | ✅ | Enforced by the lint rules |
| Return All + Limit on list operations | ✅ | Offset pagination |
| Optional fields in collections | ✅ | |
| Module requirements are clear | ✅ | Margin and expense fields need `tms_cost`, expiries need `tms_expiry`; said in the field descriptions and the README. Missing fields are dropped after asking Odoo (`fields_get`) |

## Functional test

⏳ **Pending.** Nothing has been run against a real Traficora instance yet: no API key was created and no instance was touched while building the package. What needs checking, in n8n (docker) with the package installed from its `npm pack` tarball into `~/.n8n/nodes`:

- Credential test against a Traficora instance with an API key (Preferences → Account security → New API key).
- That the instance exposes Odoo's JSON-2 endpoint (`/json/2/...`) through the proxy and that `X-Odoo-Database` is only needed on multi-database hosts.
- Every resource: Order Create / Get / Get Many / Update, Trip Get / Get Many (with and without `tms_cost`), Trip Expense Create / Get Many, Expiring Document Get Many, Vehicle Get / Get Many, Customer Create / Get Many.
- Trigger: the four events on an active workflow, and that a second poll does not repeat items.

## Publish and submit: exact steps for Juan

Nothing below has been done. Each step goes out to GitHub, npm or n8n with your accounts.

1. **Create the public repo** (account `francodesystems`):
   ```bash
   cd ~/Projects/srcanton/n8n-nodes-traficora
   GH_TOKEN=<francodesystems token> gh repo create francodesystems/n8n-nodes-traficora --public --source . --push
   ```
2. **npm authentication for the first release.** A Trusted Publisher can only be added to a package that already exists, so the first publish uses a token: GitHub → the repo → Settings → Secrets and variables → Actions → New secret `NPM_TOKEN` (granular token of the `francodesystems-npm` org, read and write).
3. **Release 0.1.0 from CI with provenance:** `git tag 0.1.0 && git push origin 0.1.0`. The tag runs `.github/workflows/publish.yml` (Node 22), whose `prepublishOnly` builds, lints, tests and scans, then publishes with provenance.
4. **Switch to Trusted Publishing:** npmjs.com → the package → Settings → Trusted Publishers → GitHub Actions: owner `francodesystems`, repository `n8n-nodes-traficora`, workflow `publish.yml`. Then delete the `NPM_TOKEN` secret.
5. **Run the real scan:** `npx @n8n/scan-community-package @francodesystems-npm/n8n-nodes-traficora` (exit code 0 = passed).
6. **Submit:** [creators.n8n.io/nodes](https://creators.n8n.io/nodes) (same creator profile as Holded) → Submit node → `@francodesystems-npm/n8n-nodes-traficora`. The reviewers need a Traficora instance and an API key that works, for example on a demo database. Review can take up to four weeks.
7. After publishing: `traficora.com/integraciones/n8n` already gives the install name, so it stops pointing at a missing package once step 3 is done.
