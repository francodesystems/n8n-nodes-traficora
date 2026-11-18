const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
	addDays,
	buildDomain,
	collectOffsetPages,
	localDate,
	normalizeBaseUrl,
	jsonUrl,
	odooErrorHint,
	odooErrorOf,
	selectFields,
	simplifyRecord,
	splitFields,
	toId,
	toIds,
	toOdooDate,
	toOdooDatetime,
} = require('../dist/nodes/Traficora/odoo');

// ── base URL ──────────────────────────────────────────────────────────────

test('normalizeBaseUrl keeps the origin of whatever Traficora URL is pasted', () => {
	assert.equal(normalizeBaseUrl('https://empresa.traficora.com/'), 'https://empresa.traficora.com');
	assert.equal(
		normalizeBaseUrl(' https://empresa.traficora.com/odoo/action-12?x=1 '),
		'https://empresa.traficora.com',
	);
	assert.equal(
		normalizeBaseUrl('https://empresa.traficora.com/web#id=3'),
		'https://empresa.traficora.com',
	);
	assert.equal(normalizeBaseUrl('empresa.traficora.com'), 'https://empresa.traficora.com');
	assert.equal(normalizeBaseUrl('http://localhost:8069'), 'http://localhost:8069');
	assert.equal(normalizeBaseUrl(''), '');
	assert.equal(
		jsonUrl('https://empresa.traficora.com/', 'tms.order', 'search_read'),
		'https://empresa.traficora.com/json/2/tms.order/search_read',
	);
});

// ── datetimes ─────────────────────────────────────────────────────────────

test('toOdooDatetime turns n8n dates into Odoo UTC «YYYY-MM-DD HH:MM:SS»', () => {
	assert.equal(toOdooDatetime('2026-11-18T10:30:00Z'), '2026-11-18 10:30:00');
	assert.equal(toOdooDatetime('2026-11-18T10:30:00.123+01:00'), '2026-11-18 09:30:00');
	// No zone: read in the workflow timezone (Madrid is UTC+1 in November, UTC+2 in July).
	assert.equal(toOdooDatetime('2026-11-18T10:30:00', 'Europe/Madrid'), '2026-11-18 09:30:00');
	assert.equal(toOdooDatetime('2026-07-01T10:30', 'Europe/Madrid'), '2026-07-01 08:30:00');
	assert.equal(toOdooDatetime('2026-11-18', 'Europe/Madrid'), '2026-11-17 23:00:00');
	assert.equal(toOdooDatetime('2026-11-18T10:30:00', 'UTC'), '2026-11-18 10:30:00');
	// Already in Odoo format (as returned by Odoo): left as it is.
	assert.equal(toOdooDatetime('2026-11-18 10:30:00', 'Europe/Madrid'), '2026-11-18 10:30:00');
	assert.equal(toOdooDatetime(''), undefined);
	assert.equal(toOdooDatetime('not a date'), undefined);
});

test('toOdooDatetime handles the DST change in the workflow timezone', () => {
	// 29 March 2026, 03:30 in Madrid is already summer time (UTC+2).
	assert.equal(toOdooDatetime('2026-03-29T03:30:00', 'Europe/Madrid'), '2026-03-29 01:30:00');
	assert.equal(toOdooDatetime('2026-03-29T01:30:00', 'Europe/Madrid'), '2026-03-29 00:30:00');
});

test('toOdooDate takes the calendar day, in the workflow timezone when there is a zone', () => {
	assert.equal(toOdooDate('2026-11-18'), '2026-11-18');
	assert.equal(toOdooDate('2026-11-18T10:00:00'), '2026-11-18');
	assert.equal(toOdooDate('2026-11-18T23:30:00Z', 'Europe/Madrid'), '2026-11-19');
	assert.equal(toOdooDate(''), undefined);
	assert.equal(localDate(new Date('2026-11-18T23:30:00Z'), 'Europe/Madrid'), '2026-11-19');
	assert.equal(localDate(new Date('2026-11-18T23:30:00Z'), 'UTC'), '2026-11-18');
	assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

// ── domains and IDs ───────────────────────────────────────────────────────

test('buildDomain ANDs only the filters that are set, converted', () => {
	const domain = buildDomain(
		{ state: ['confirmed', 'planned'], customer: '7', clientRef: '', tripId: 'abc', other: 1 },
		{
			state: { field: 'state', operator: 'in' },
			customer: { field: 'partner_id', operator: '=', convert: toId },
			clientRef: { field: 'client_ref', operator: 'ilike' },
			tripId: { field: 'trip_id', operator: '=', convert: toId },
		},
	);
	assert.deepEqual(domain, [
		['state', 'in', ['confirmed', 'planned']],
		['partner_id', '=', 7],
	]);
	assert.deepEqual(buildDomain({ state: [] }, { state: { field: 'state', operator: 'in' } }), []);
});

test('toId accepts numbers, numeric strings, many2one pairs and resource locators', () => {
	assert.equal(toId(7), 7);
	assert.equal(toId(' 42 '), 42);
	assert.equal(toId([5, 'ACME']), 5);
	assert.equal(toId({ __rl: true, mode: 'list', value: '9' }), 9);
	assert.equal(toId(''), undefined);
	assert.equal(toId('12a'), undefined);
	assert.equal(toId(0), undefined);
	assert.equal(toId(-3), undefined);
	assert.equal(toId(1.5), undefined);
	assert.deepEqual(toIds('1, 2,x,3'), [1, 2, 3]);
	assert.deepEqual(toIds([4, '5']), [4, 5]);
	assert.deepEqual(toIds(undefined), []);
});

test('splitFields and selectFields', () => {
	assert.deepEqual(splitFields(' name, state ,,partner_id '), ['name', 'state', 'partner_id']);
	assert.deepEqual(splitFields(undefined), []);
	const defaults = ['id', 'name', 'margin', 'state'];
	// Without tms_cost the instance has no «margin»: it is left out of the defaults.
	assert.deepEqual(selectFields(defaults, { id: 'integer', name: 'char', state: 'selection' }), [
		'id',
		'name',
		'state',
	]);
	assert.deepEqual(selectFields(defaults, null), defaults);
	assert.deepEqual(selectFields(defaults, null, ['state', 'id', 'name']), ['id', 'state', 'name']);
});

// ── simplify ──────────────────────────────────────────────────────────────

test('simplifyRecord flattens many2one, converts datetimes and empty values', () => {
	const types = {
		id: 'integer',
		name: 'char',
		client_ref: 'char',
		partner_id: 'many2one',
		trip_id: 'many2one',
		date_load: 'datetime',
		date_expiry: 'date',
		is_adr: 'boolean',
		price: 'monetary',
	};
	const raw = {
		id: 3,
		name: 'S/2026/0003',
		client_ref: false,
		partner_id: [7, 'ACME Logística'],
		trip_id: false,
		date_load: '2026-11-18 08:30:00',
		date_expiry: '2026-12-01',
		is_adr: false,
		price: 450,
	};
	assert.deepEqual(simplifyRecord(raw, types), {
		id: 3,
		name: 'S/2026/0003',
		client_ref: null,
		partner_id: 7,
		partner_name: 'ACME Logística',
		trip_id: null,
		trip_name: null,
		date_load: '2026-11-18T08:30:00.000Z',
		date_expiry: '2026-12-01',
		is_adr: false,
		price: 450,
	});
});

test('simplifyRecord without field types only flattens [id, name] pairs', () => {
	assert.deepEqual(
		simplifyRecord({ id: 1, vehicle_id: [2, '1234 ABC'], active: false, tags: [1, 2] }),
		{
			id: 1,
			vehicle_id: 2,
			vehicle_name: '1234 ABC',
			active: false,
			tags: [1, 2],
		},
	);
	// A many2one field not ending in _id keeps its name and gets «_name».
	assert.deepEqual(simplifyRecord({ parent: [4, 'X'] }, { parent: 'many2one' }), {
		parent: 4,
		parent_name: 'X',
	});
});

// ── pagination ────────────────────────────────────────────────────────────

function fakeSearchRead(total) {
	const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
	const calls = [];
	const fetchPage = async (offset, limit) => {
		calls.push({ offset, limit });
		return rows.slice(offset, offset + limit);
	};
	return { rows, calls, fetchPage };
}

test('Return All reads pages by offset until a short page', async () => {
	const api = fakeSearchRead(450);
	const out = await collectOffsetPages(api.fetchPage, null);
	assert.deepEqual(out, api.rows);
	assert.deepEqual(api.calls, [
		{ offset: 0, limit: 200 },
		{ offset: 200, limit: 200 },
		{ offset: 400, limit: 200 },
	]);
});

test('a limit asks only for what is left', async () => {
	const api = fakeSearchRead(1000);
	const out = await collectOffsetPages(api.fetchPage, 250);
	assert.equal(out.length, 250);
	assert.deepEqual(api.calls, [
		{ offset: 0, limit: 200 },
		{ offset: 200, limit: 50 },
	]);
});

test('an exact multiple of the page size costs one empty page; empty results one call', async () => {
	const api = fakeSearchRead(400);
	assert.equal((await collectOffsetPages(api.fetchPage, null)).length, 400);
	assert.equal(api.calls.length, 3);
	const empty = fakeSearchRead(0);
	assert.deepEqual(await collectOffsetPages(empty.fetchPage, 50), []);
	assert.equal(empty.calls.length, 1);
});

test('maxPages stops a server that never returns a short page', async () => {
	let calls = 0;
	const out = await collectOffsetPages(
		async (offset, limit) => {
			calls++;
			return Array.from({ length: limit }, (_, i) => ({ id: offset + i }));
		},
		null,
		10,
		5,
	);
	assert.equal(calls, 5);
	assert.equal(out.length, 50);
});

// ── errors ────────────────────────────────────────────────────────────────

// As Odoo 20 answers (rpc/controllers/json2.py + http/dispatcher.py serialize_exception).
const UNAUTHORIZED = {
	name: 'werkzeug.exceptions.Unauthorized',
	message: 'Invalid apikey',
	arguments: ['Invalid apikey', 401],
	context: {},
	debug: 'Traceback…',
};

test('odooErrorOf reads the JSON-2 error body wherever the HTTP helper put it', () => {
	assert.deepEqual(odooErrorOf({ response: { status: 401, data: UNAUTHORIZED } }), {
		name: 'werkzeug.exceptions.Unauthorized',
		message: 'Invalid apikey',
		status: 401,
	});
	assert.deepEqual(
		odooErrorOf({
			cause: {
				response: {
					status: 422,
					body: Buffer.from(
						JSON.stringify({ name: 'odoo.exceptions.UserError', message: 'No se puede cancelar' }),
					),
				},
			},
		}),
		{ name: 'odoo.exceptions.UserError', message: 'No se puede cancelar', status: 422 },
	);
	assert.deepEqual(
		odooErrorOf({
			response: { data: JSON.stringify({ name: 'X', message: '', arguments: ['from args'] }) },
		}),
		{ name: 'X', message: 'from args', status: undefined },
	);
	assert.equal(odooErrorOf({ response: { data: '<html>Not Found</html>' } }), null);
	assert.equal(odooErrorOf(new Error('socket hang up')), null);
});

test('odooErrorHint explains the usual causes', () => {
	assert.match(
		odooErrorHint({
			name: 'werkzeug.exceptions.Unauthorized',
			message: 'Invalid apikey',
			status: 401,
		}),
		/API key/,
	);
	assert.match(
		odooErrorHint(
			{
				name: 'werkzeug.exceptions.NotFound',
				message: "the model 'tms.trip.expense' does not exist",
				status: 404,
			},
			'tms.trip.expense',
		),
		/tms_cost/,
	);
	assert.match(
		odooErrorHint(
			{
				name: 'werkzeug.exceptions.NotFound',
				message: "the model 'tms.expiry' does not exist",
				status: 404,
			},
			'tms.expiry',
		),
		/tms_expiry/,
	);
	assert.match(
		odooErrorHint({
			name: 'ValueError',
			message: "Invalid field 'margin' on model 'tms.order'",
			status: 500,
		}),
		/tms_cost/,
	);
	assert.match(
		odooErrorHint({ name: 'odoo.exceptions.AccessError', message: 'nope', status: 403 }),
		/permissions/,
	);
	assert.equal(odooErrorHint({ name: 'Weird', message: 'x', status: 500 }), '');
});
