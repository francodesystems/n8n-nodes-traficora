// Pure helpers for the Odoo JSON-2 API (no n8n context): base URL, domains,
// datetimes, record simplification, offset pagination and error parsing.
// Unit-tested in test/*.test.js.
import type { IDataObject } from 'n8n-workflow';

export type DomainLeaf = [string, string, unknown];
export type Domain = Array<DomainLeaf | '&' | '|' | '!'>;

// The module each optional model or field comes from, for clearer errors.
export const MODULE_OF_MODEL: Record<string, string> = {
	'tms.order': 'TMS Base (tms_base)',
	'tms.trip': 'TMS Base (tms_base)',
	'tms.trip.expense': 'Gastos y margen (tms_cost)',
	'tms.expense.type': 'Gastos y margen (tms_cost)',
	'tms.expiry': 'Caducidades (tms_expiry)',
	'tms.expiry.type': 'Caducidades (tms_expiry)',
	'fleet.vehicle': 'Fleet (fleet)',
};

// «https://empresa.traficora.com/odoo/action-123» → «https://empresa.traficora.com».
export function normalizeBaseUrl(raw: unknown): string {
	if (typeof raw !== 'string' || !raw.trim()) return '';
	let url = raw
		.trim()
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '');
	url = url.replace(/\/(odoo|web)(\/.*)?$/, '').replace(/\/+$/, '');
	if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
	return url;
}

export function jsonUrl(baseUrl: string, model: string, method: string): string {
	return `${normalizeBaseUrl(baseUrl)}/json/2/${model}/${method}`;
}

// ── Datetimes ──────────────────────────────────────────────────────────────
// Odoo stores datetimes in UTC and the API speaks «YYYY-MM-DD HH:MM:SS».

const ODOO_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export function formatOdooDatetime(date: Date): string {
	return (
		`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
		`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
	);
}

export function parseOdooDatetime(value: string): Date {
	return new Date(`${value.replace(' ', 'T')}Z`);
}

// Minutes the zone is ahead of UTC at that instant (Europe/Madrid in summer: 120).
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(instant);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour') % 24,
		get('minute'),
		get('second'),
	);
	return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

// An n8n date (ISO with or without zone, or already Odoo-formatted) → Odoo UTC datetime.
// Without a zone, the value is read in `timeZone` (the workflow's timezone).
export function toOdooDatetime(value: unknown, timeZone = 'UTC'): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value instanceof Date) return formatOdooDatetime(value);
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	const odoo = ODOO_DATETIME.exec(text);
	if (odoo) return text; // already UTC, as Odoo returns it
	const naive = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(
		text,
	);
	if (naive) {
		const [, y, mo, d, h = '0', mi = '0', s = '0'] = naive;
		const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
		// Two passes so a DST change between the guess and the result is handled.
		let utc = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000;
		utc = wall - zoneOffsetMinutes(new Date(utc), timeZone) * 60000;
		return formatOdooDatetime(new Date(utc));
	}
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return formatOdooDatetime(parsed);
}

// n8n date → «YYYY-MM-DD» (Odoo date fields have no time and no zone).
export function toOdooDate(value: unknown, timeZone = 'UTC'): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const text = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	// With a zone, take the calendar day in the workflow's timezone.
	if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
		const date = new Date(text);
		if (!Number.isNaN(date.getTime())) return localDate(date, timeZone);
	}
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	return match ? match[1] : undefined;
}

// The calendar day of an instant in a timezone, «YYYY-MM-DD».
export function localDate(instant: Date, timeZone = 'UTC'): string {
	const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant, timeZone) * 60000);
	return shifted.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

// ── Domains ────────────────────────────────────────────────────────────────

export interface FilterSpec {
	field: string;
	operator: string;
	// How to turn the n8n value into the Odoo value; undefined skips the leaf.
	convert?: (value: unknown) => unknown;
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === '' ||
		(Array.isArray(value) && value.length === 0)
	);
}

// n8n filters collection → AND-ed Odoo domain, in the order of `specs`.
export function buildDomain(filters: IDataObject, specs: Record<string, FilterSpec>): Domain {
	const domain: Domain = [];
	for (const [name, spec] of Object.entries(specs)) {
		const raw = filters[name];
		if (isEmpty(raw)) continue;
		const value = spec.convert ? spec.convert(raw) : raw;
		if (isEmpty(value)) continue;
		domain.push([spec.field, spec.operator, value]);
	}
	return domain;
}

// A numeric record ID from a parameter: «12», 12 or a many2one pair [12, "name"].
export function toId(value: unknown): number | undefined {
	if (Array.isArray(value)) return toId(value[0]);
	if (value && typeof value === 'object' && 'value' in (value as IDataObject))
		return toId((value as IDataObject).value);
	if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : undefined;
	if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
		const id = Number(value.trim());
		return id > 0 ? id : undefined;
	}
	return undefined;
}

export function toIds(value: unknown): number[] {
	const list = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(',')
			: value === undefined || value === null
				? []
				: [value];
	return list.map(toId).filter((id): id is number => id !== undefined);
}

// Drops empty values from an n8n collection so only what the user set is sent.
export function compact(fields: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === '' || value === undefined || value === null) continue;
		out[key] = value;
	}
	return out;
}

// «name, client_ref ,state» → ['name', 'client_ref', 'state'].
export function splitFields(value: unknown): string[] {
	if (Array.isArray(value))
		return value
			.map(String)
			.map((s) => s.trim())
			.filter(Boolean);
	if (typeof value !== 'string') return [];
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

// The fields to read: the user's list, or the defaults the instance has
// (margins only exist with tms_cost, so missing ones are left out).
export function selectFields(
	defaults: string[],
	available: Record<string, string> | null,
	requested: string[] = [],
): string[] {
	if (requested.length) return Array.from(new Set(['id', ...requested]));
	if (!available) return defaults;
	return defaults.filter((field) => field === 'id' || field in available);
}

// ── Simplify ───────────────────────────────────────────────────────────────

function stripId(field: string): string {
	return field.endsWith('_id') ? field.slice(0, -3) : field;
}

// Odoo record → flat JSON:
// - many2one [7, "ACME"] → `partner_id: 7` and `partner_name: "ACME"` (false → null, null)
// - datetime «2026-11-18 08:30:00» (UTC) → ISO «2026-11-18T08:30:00.000Z»
// - false in a non-boolean field (empty char, date, number…) → null
// `types` comes from fields_get (field → Odoo type); without it, only the many2one shape is used.
export function simplifyRecord(
	record: IDataObject,
	types: Record<string, string> | null = null,
): IDataObject {
	const out: IDataObject = {};
	for (const [field, value] of Object.entries(record)) {
		const type = types?.[field];
		const isPair =
			Array.isArray(value) &&
			value.length === 2 &&
			typeof value[0] === 'number' &&
			typeof value[1] === 'string';
		if (type === 'many2one' || (type === undefined && isPair)) {
			const base = stripId(field);
			const nameKey = base === field ? `${field}_name` : `${base}_name`;
			if (isPair) {
				out[field] = (value as [number, string])[0];
				out[nameKey] = (value as [number, string])[1];
			} else {
				out[field] = null;
				out[nameKey] = null;
			}
			continue;
		}
		if (value === false && type !== undefined && type !== 'boolean') {
			out[field] = null;
			continue;
		}
		if (type === 'datetime' && typeof value === 'string' && ODOO_DATETIME.test(value)) {
			out[field] = parseOdooDatetime(value).toISOString();
			continue;
		}
		out[field] = value as IDataObject[keyof IDataObject];
	}
	return out;
}

// ── Pagination ─────────────────────────────────────────────────────────────

export type OffsetPageFetcher = (offset: number, limit: number) => Promise<IDataObject[]>;

export const PAGE_SIZE = 200;

// search_read pages by offset: read until a short page or the limit.
export async function collectOffsetPages(
	fetchPage: OffsetPageFetcher,
	limit: number | null,
	pageSize = PAGE_SIZE,
	maxPages = 1000,
): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	for (let page = 0; page < maxPages; page++) {
		const want = limit === null ? pageSize : Math.min(pageSize, limit - out.length);
		if (want <= 0) break;
		const rows = await fetchPage(out.length, want);
		out.push(...rows);
		if (rows.length < want) break;
	}
	return limit === null ? out : out.slice(0, limit);
}

// ── Errors ─────────────────────────────────────────────────────────────────

export interface OdooError {
	name: string;
	message: string;
	status?: number;
}

// JSON-2 answers errors as { name, message, arguments, context, debug } with an HTTP status
// (401 bad key, 403 access, 404 unknown model/method, 422 bad arguments or UserError, 500…).
export function odooErrorOf(error: unknown): OdooError | null {
	const e = error as {
		httpCode?: unknown;
		response?: { status?: unknown; data?: unknown; body?: unknown };
		cause?: { response?: { status?: unknown; data?: unknown; body?: unknown } };
	};
	const status =
		Number(e?.response?.status ?? e?.cause?.response?.status ?? e?.httpCode) || undefined;
	const candidates = [
		e?.response?.data,
		e?.response?.body,
		e?.cause?.response?.data,
		e?.cause?.response?.body,
	];
	for (const raw of candidates) {
		let data = raw;
		if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) data = data.toString('utf8');
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data);
			} catch {
				continue;
			}
		}
		const body = data as { name?: unknown; message?: unknown; arguments?: unknown };
		if (body && typeof body === 'object' && typeof body.name === 'string') {
			let message = typeof body.message === 'string' ? body.message : '';
			if (!message && Array.isArray(body.arguments) && typeof body.arguments[0] === 'string')
				message = body.arguments[0];
			return { name: body.name, message: message || body.name, status };
		}
	}
	return null;
}

// A short, actionable explanation for the error description.
export function odooErrorHint(error: OdooError, model?: string): string {
	const name = error.name;
	const message = error.message;
	if (name.endsWith('Unauthorized') || error.status === 401)
		return 'Check the API key in the credential (it may have expired) and the Base URL.';
	if (/AccessError/.test(name) || error.status === 403)
		return 'The Traficora user of the API key has no access to this. Use a user with the right permissions.';
	if (/does not exist/.test(message) && model) {
		const module = MODULE_OF_MODEL[model];
		return module
			? `The model ${model} is not installed. It needs the Traficora module ${module}.`
			: `The model ${model} is not installed in this instance.`;
	}
	if (/Invalid field/i.test(message))
		return 'A field is not available in this instance: it may belong to an optional Traficora module (margins need tms_cost). Check the Fields option.';
	if (name.endsWith('NotFound') || error.status === 404)
		return 'Not found. Check the Base URL (and the Database, if the server hosts several).';
	if (/MissingError/.test(name)) return 'The record does not exist or was deleted.';
	if (/ValidationError|UserError/.test(name)) return 'Traficora refused the change.';
	return '';
}
