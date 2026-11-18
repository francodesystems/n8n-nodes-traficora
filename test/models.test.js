const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
	ACTIVE_HOLDER_DOMAIN,
	buildCustomerVals,
	buildExpenseVals,
	buildOrderVals,
	customerDomain,
	DEFAULT_FIELDS,
	expenseDomain,
	expiryDomain,
	orderDomain,
	tripDomain,
	vehicleDomain,
} = require('../dist/nodes/Traficora/models');

// Fields of tms.order in tms_base/models/tms_order.py (+ tms_cost): the node never sends others.
const ORDER_WRITABLE = new Set([
	'client_ref',
	'partner_id',
	'origin_address',
	'date_load',
	'dest_address',
	'date_unload',
	'goods_description',
	'weight_kg',
	'packages',
	'is_adr',
	'notes',
	'price',
	'trip_id',
]);

test('buildOrderVals maps every input to a tms.order field', () => {
	const vals = buildOrderVals(
		{
			clientRef: '45255/2026',
			originAddress: 'Polígono Fuente del Jarro, Paterna',
			dateLoad: '2026-11-19T08:00:00',
			destAddress: 'Mercabarna, Barcelona',
			dateUnload: '2026-11-19T18:00:00+01:00',
			goodsDescription: 'Fruta refrigerada',
			weightKg: 18000,
			packages: 33,
			isAdr: false,
			price: 780.5,
			notes: 'Muelle 4',
			tripId: '12',
		},
		'Europe/Madrid',
	);
	assert.deepEqual(vals, {
		client_ref: '45255/2026',
		origin_address: 'Polígono Fuente del Jarro, Paterna',
		dest_address: 'Mercabarna, Barcelona',
		goods_description: 'Fruta refrigerada',
		weight_kg: 18000,
		packages: 33,
		is_adr: false,
		price: 780.5,
		notes: 'Muelle 4',
		date_load: '2026-11-19 07:00:00',
		date_unload: '2026-11-19 17:00:00',
		trip_id: 12,
	});
	for (const key of Object.keys(vals)) assert.ok(ORDER_WRITABLE.has(key), key);
});

test('buildOrderVals on update: customer, clearing the reference, bad IDs', () => {
	assert.deepEqual(buildOrderVals({ customerId: '7', clientRef: '' }, 'UTC'), {
		client_ref: '',
		partner_id: 7,
	});
	assert.deepEqual(buildOrderVals({ originAddress: '' }, 'UTC'), {});
	assert.throws(() => buildOrderVals({ tripId: 'R/0001' }, 'UTC'), /numeric ID/);
	assert.throws(() => buildOrderVals({ dateLoad: 'tomorrow' }, 'UTC'), /not a valid date/);
});

test('orderDomain', () => {
	assert.deepEqual(
		orderDomain(
			{
				state: ['confirmed'],
				customer: { __rl: true, mode: 'list', value: '7' },
				clientRef: '452',
				dateLoadFrom: '2026-11-01T00:00:00',
				dateLoadTo: '2026-11-30T23:59:59',
			},
			'Europe/Madrid',
		),
		[
			['state', 'in', ['confirmed']],
			['partner_id', '=', 7],
			['client_ref', 'ilike', '452'],
			['date_load', '>=', '2026-10-31 23:00:00'],
			['date_load', '<=', '2026-11-30 22:59:59'],
		],
	);
	assert.deepEqual(orderDomain({}, 'UTC'), []);
	// An empty resource locator is no filter.
	assert.deepEqual(orderDomain({ customer: { __rl: true, mode: 'list', value: '' } }, 'UTC'), []);
});

test('tripDomain', () => {
	assert.deepEqual(
		tripDomain(
			{ state: ['done'], vehicleId: 3, driverId: '9', dateFrom: '2026-11-01T00:00:00Z' },
			'UTC',
		),
		[
			['state', 'in', ['done']],
			['vehicle_id', '=', 3],
			['driver_id', '=', 9],
			['date_start', '>=', '2026-11-01 00:00:00'],
		],
	);
});

test('buildExpenseVals: a fuel ticket with litres', () => {
	assert.deepEqual(
		buildExpenseVals(
			'12',
			2,
			151.25,
			{
				liters: 95.4,
				date: '2026-11-18T07:12:00',
				paidBy: 'card',
				supplierId: '31',
				note: ' Repsol A-7 ',
			},
			'Europe/Madrid',
		),
		{
			trip_id: 12,
			type_id: 2,
			amount_total: 151.25,
			date: '2026-11-18',
			liters: 95.4,
			paid_by: 'card',
			note: 'Repsol A-7',
			partner_id: 31,
		},
	);
	// Amount without VAT only when set: otherwise Traficora computes it.
	assert.deepEqual(buildExpenseVals(1, 3, 12.4, { amount: 10.25 }, 'UTC'), {
		trip_id: 1,
		type_id: 3,
		amount_total: 12.4,
		amount: 10.25,
	});
	assert.throws(() => buildExpenseVals('', 3, 1, {}, 'UTC'), /Trip ID/);
	assert.throws(() => buildExpenseVals(1, '', 1, {}, 'UTC'), /expense type/);
});

test('expenseDomain', () => {
	assert.deepEqual(
		expenseDomain({ tripId: '4', fuelOnly: true, paidBy: '', dateFrom: '2026-11-01' }, 'UTC'),
		[
			['trip_id', '=', 4],
			['date', '>=', '2026-11-01'],
			['type_id.is_fuel', '=', true],
		],
	);
});

test('expiryDomain: within N days counts from today, and leaves archived holders out by default', () => {
	assert.deepEqual(expiryDomain({ withinDays: 30, state: ['soon', 'expired'] }, '2026-11-18'), [
		['state', 'in', ['soon', 'expired']],
		['date_expiry', '<=', '2026-12-18'],
		...ACTIVE_HOLDER_DOMAIN,
	]);
	assert.deepEqual(expiryDomain({ activeHolders: false, vehicleId: 5 }, '2026-11-18'), [
		['vehicle_id', '=', 5],
	]);
	assert.deepEqual(expiryDomain({ withinDays: 0, activeHolders: false }, '2026-11-18'), [
		['date_expiry', '<=', '2026-11-18'],
	]);
});

test('vehicleDomain and customerDomain', () => {
	assert.deepEqual(vehicleDomain({ search: '1234', includeArchived: true }), [
		'|',
		['name', 'ilike', '1234'],
		['license_plate', 'ilike', '1234'],
		['active', 'in', [true, false]],
	]);
	assert.deepEqual(customerDomain({ vat: 'B123', companiesOnly: true }), [
		['vat', 'ilike', 'B123'],
		['is_company', '=', true],
		['tms_is_driver', '=', false],
	]);
	assert.deepEqual(customerDomain({ search: 'acme', excludeDrivers: false }), [
		'|',
		'|',
		'|',
		['name', 'ilike', 'acme'],
		['vat', 'ilike', 'acme'],
		['email', 'ilike', 'acme'],
		['ref', 'ilike', 'acme'],
	]);
});

test('buildCustomerVals', () => {
	assert.deepEqual(
		buildCustomerVals(' Transportes Ejemplo SL ', {
			vat: 'ESB12345678',
			email: '',
			city: 'Valencia',
		}),
		{
			name: 'Transportes Ejemplo SL',
			vat: 'ESB12345678',
			city: 'Valencia',
			is_company: true,
			customer_rank: 1,
		},
	);
	assert.equal(buildCustomerVals('Ana', { isCompany: false }).is_company, false);
	assert.throws(() => buildCustomerVals(' ', {}), /Name/);
});

test('default fields include the margin fields of tms_cost and always the id', () => {
	for (const fields of Object.values(DEFAULT_FIELDS)) assert.equal(fields[0], 'id');
	for (const f of ['margin', 'margin_percent']) {
		assert.ok(DEFAULT_FIELDS['tms.order'].includes(f));
		assert.ok(DEFAULT_FIELDS['tms.trip'].includes(f));
	}
	for (const f of ['fuel_liters', 'cost_per_km', 'cost_total', 'margin_revenue', 'revenue'])
		assert.ok(DEFAULT_FIELDS['tms.trip'].includes(f), f);
});
