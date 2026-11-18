// The Traficora (Odoo) models the node reads and writes, with their default
// fields and how the node's inputs map to Odoo values. Field names checked
// against the Traficora addons (tms_base, tms_cost, tms_expiry) for Odoo 20.
import type { IDataObject } from 'n8n-workflow';

import {
	addDays,
	buildDomain,
	compact,
	toId,
	toOdooDate,
	toOdooDatetime,
	type Domain,
} from './odoo';

export const MODELS = {
	order: 'tms.order',
	trip: 'tms.trip',
	tripExpense: 'tms.trip.expense',
	expenseType: 'tms.expense.type',
	expiry: 'tms.expiry',
	expiryType: 'tms.expiry.type',
	vehicle: 'fleet.vehicle',
	customer: 'res.partner',
	country: 'res.country',
} as const;

// Default fields. The ones an instance does not have (margins without tms_cost)
// are left out using fields_get.
export const DEFAULT_FIELDS: Record<string, string[]> = {
	'tms.order': [
		'id',
		'name',
		'client_ref',
		'state',
		'partner_id',
		'origin_address',
		'date_load',
		'dest_address',
		'date_unload',
		'goods_description',
		'weight_kg',
		'packages',
		'is_adr',
		'price',
		'currency_id',
		'trip_id',
		'vehicle_id',
		'driver_id',
		'invoice_id',
		// tms_cost
		'cost_share',
		'margin',
		'margin_percent',
		'create_date',
		'write_date',
	],
	'tms.trip': [
		'id',
		'name',
		'state',
		'vehicle_id',
		'trailer_id',
		'driver_id',
		'user_id',
		'date_start',
		'date_end',
		'odometer_start',
		'odometer_end',
		'distance_km',
		'order_count',
		'total_weight_kg',
		'revenue',
		'currency_id',
		// tms_cost
		'margin_revenue',
		'cost_expenses',
		'cost_km',
		'cost_total',
		'cost_per_km',
		'margin',
		'margin_percent',
		'fuel_liters',
		'fuel_consumption',
		'create_date',
		'write_date',
	],
	'tms.trip.expense': [
		'id',
		'trip_id',
		'vehicle_id',
		'driver_id',
		'date',
		'type_id',
		'is_fuel',
		'amount_total',
		'amount',
		'liters',
		'partner_id',
		'paid_by',
		'reimbursed',
		'state',
		'note',
		'currency_id',
		'create_date',
		'write_date',
	],
	'tms.expiry': [
		'id',
		'display_name',
		'type_id',
		'applies_to',
		'vehicle_id',
		'partner_id',
		'number',
		'date_expiry',
		'state',
		'days_left',
		'note',
		'create_date',
		'write_date',
	],
	'fleet.vehicle': [
		'id',
		'name',
		'license_plate',
		'model_id',
		'category_id',
		'driver_id',
		'vin_sn',
		'odometer',
		'odometer_unit',
		'acquisition_date',
		'state_id',
		'active',
		// tms_cost
		'tms_cost_per_km',
		'write_date',
	],
	'res.partner': [
		'id',
		'name',
		'is_company',
		'vat',
		'ref',
		'email',
		'phone',
		'street',
		'zip',
		'city',
		'state_id',
		'country_id',
		'customer_rank',
		'create_date',
		'write_date',
	],
};

type Collection = IDataObject;

function many2one(value: unknown): number | false | undefined {
	if (value === undefined || value === null) return undefined;
	if (value === '' || value === false) return undefined;
	return toId(value);
}

// ── Order ──────────────────────────────────────────────────────────────────

const ORDER_FIELD_MAP: Record<string, string> = {
	clientRef: 'client_ref',
	originAddress: 'origin_address',
	destAddress: 'dest_address',
	goodsDescription: 'goods_description',
	weightKg: 'weight_kg',
	packages: 'packages',
	isAdr: 'is_adr',
	price: 'price',
	notes: 'notes',
};

export class InputError extends Error {}

// n8n order fields → tms.order values (create and write).
export function buildOrderVals(fields: Collection, timeZone: string): IDataObject {
	const vals: IDataObject = {};
	for (const [input, field] of Object.entries(ORDER_FIELD_MAP)) {
		if (!(input in fields)) continue;
		const value = fields[input];
		if (typeof value === 'string' && value === '' && input !== 'notes' && input !== 'clientRef')
			continue;
		vals[field] = value as IDataObject[keyof IDataObject];
	}
	for (const [input, field] of [
		['dateLoad', 'date_load'],
		['dateUnload', 'date_unload'],
	]) {
		if (!(input in fields) || fields[input] === '') continue;
		const value = toOdooDatetime(fields[input], timeZone);
		if (value === undefined)
			throw new InputError(`${input} is not a valid date: ${String(fields[input])}`);
		vals[field] = value;
	}
	for (const [input, field] of [
		['tripId', 'trip_id'],
		['customerId', 'partner_id'],
	]) {
		if (!(input in fields) || fields[input] === '' || fields[input] === undefined) continue;
		const id = many2one(fields[input]);
		if (!id) throw new InputError(`${input} must be a numeric ID, got ${String(fields[input])}`);
		vals[field] = id;
	}
	return vals;
}

export function orderDomain(filters: Collection, timeZone: string): Domain {
	return buildDomain(filters, {
		state: { field: 'state', operator: 'in' },
		customer: { field: 'partner_id', operator: '=', convert: toId },
		clientRef: { field: 'client_ref', operator: 'ilike' },
		name: { field: 'name', operator: 'ilike' },
		tripId: { field: 'trip_id', operator: '=', convert: toId },
		dateLoadFrom: {
			field: 'date_load',
			operator: '>=',
			convert: (v) => toOdooDatetime(v, timeZone),
		},
		dateLoadTo: { field: 'date_load', operator: '<=', convert: (v) => toOdooDatetime(v, timeZone) },
		updatedSince: {
			field: 'write_date',
			operator: '>',
			convert: (v) => toOdooDatetime(v, timeZone),
		},
	});
}

// ── Trip ───────────────────────────────────────────────────────────────────

export function tripDomain(filters: Collection, timeZone: string): Domain {
	return buildDomain(filters, {
		state: { field: 'state', operator: 'in' },
		vehicleId: { field: 'vehicle_id', operator: '=', convert: toId },
		driverId: { field: 'driver_id', operator: '=', convert: toId },
		dateFrom: { field: 'date_start', operator: '>=', convert: (v) => toOdooDatetime(v, timeZone) },
		dateTo: { field: 'date_start', operator: '<=', convert: (v) => toOdooDatetime(v, timeZone) },
		updatedSince: {
			field: 'write_date',
			operator: '>',
			convert: (v) => toOdooDatetime(v, timeZone),
		},
	});
}

// ── Trip expense ───────────────────────────────────────────────────────────

export function buildExpenseVals(
	tripId: unknown,
	typeId: unknown,
	amountTotal: unknown,
	additional: Collection,
	timeZone: string,
): IDataObject {
	const trip = toId(tripId);
	if (!trip) throw new InputError(`Trip ID must be a numeric ID, got ${String(tripId)}`);
	const type = toId(typeId);
	if (!type) throw new InputError('Choose the expense type');
	const vals: IDataObject = {
		trip_id: trip,
		type_id: type,
		amount_total: Number(amountTotal) || 0,
	};
	if (additional.date) {
		const date = toOdooDate(additional.date, timeZone);
		if (!date) throw new InputError(`Date is not valid: ${String(additional.date)}`);
		vals.date = date;
	}
	// Set only when given: otherwise Traficora computes it from the ticket total and the VAT.
	if (typeof additional.amount === 'number' && additional.amount > 0)
		vals.amount = additional.amount;
	if (typeof additional.liters === 'number' && additional.liters > 0)
		vals.liters = additional.liters;
	if (additional.paidBy) vals.paid_by = additional.paidBy;
	if (typeof additional.note === 'string' && additional.note.trim())
		vals.note = additional.note.trim();
	if (additional.supplierId !== undefined && additional.supplierId !== '') {
		const supplier = toId(additional.supplierId);
		if (!supplier)
			throw new InputError(
				`Supplier ID must be a numeric ID, got ${String(additional.supplierId)}`,
			);
		vals.partner_id = supplier;
	}
	return vals;
}

export function expenseDomain(filters: Collection, timeZone: string): Domain {
	const domain = buildDomain(filters, {
		tripId: { field: 'trip_id', operator: '=', convert: toId },
		vehicleId: { field: 'vehicle_id', operator: '=', convert: toId },
		driverId: { field: 'driver_id', operator: '=', convert: toId },
		typeId: { field: 'type_id', operator: '=', convert: toId },
		dateFrom: { field: 'date', operator: '>=', convert: (v) => toOdooDate(v, timeZone) },
		dateTo: { field: 'date', operator: '<=', convert: (v) => toOdooDate(v, timeZone) },
		paidBy: { field: 'paid_by', operator: '=' },
	});
	if (filters.fuelOnly === true) domain.push(['type_id.is_fuel', '=', true]);
	return domain;
}

// ── Expiry ─────────────────────────────────────────────────────────────────

// Same rule as Traficora's own alerts (tms.expiry._active_holder_domain).
export const ACTIVE_HOLDER_DOMAIN: Domain = [
	'&',
	'|',
	['vehicle_id', '=', false],
	['vehicle_id.active', '=', true],
	'|',
	['partner_id', '=', false],
	['partner_id.active', '=', true],
];

export function expiryDomain(filters: Collection, today: string): Domain {
	const domain = buildDomain(filters, {
		state: { field: 'state', operator: 'in' },
		typeId: { field: 'type_id', operator: '=', convert: toId },
		vehicleId: { field: 'vehicle_id', operator: '=', convert: toId },
		driverId: { field: 'partner_id', operator: '=', convert: toId },
		withinDays: {
			field: 'date_expiry',
			operator: '<=',
			convert: (v) => (typeof v === 'number' && v >= 0 ? addDays(today, Math.floor(v)) : undefined),
		},
	});
	// Default true: only an explicit false lets archived holders through.
	if (filters.activeHolders !== false) domain.push(...ACTIVE_HOLDER_DOMAIN);
	return domain;
}

// ── Vehicle ────────────────────────────────────────────────────────────────

export function vehicleDomain(filters: Collection): Domain {
	const domain: Domain = [];
	if (typeof filters.search === 'string' && filters.search.trim()) {
		const text = filters.search.trim();
		domain.push('|', ['name', 'ilike', text], ['license_plate', 'ilike', text]);
	}
	const driver = toId(filters.driverId);
	if (driver) domain.push(['driver_id', '=', driver]);
	if (filters.includeArchived === true) domain.push(['active', 'in', [true, false]]);
	return domain;
}

// ── Customer ───────────────────────────────────────────────────────────────

export function buildCustomerVals(name: string, additional: Collection): IDataObject {
	if (!name || !name.trim()) throw new InputError('Name is required');
	const vals: IDataObject = compact({
		name: name.trim(),
		vat: additional.vat,
		ref: additional.ref,
		email: additional.email,
		phone: additional.phone,
		street: additional.street,
		zip: additional.zip,
		city: additional.city,
		comment: additional.comment,
	});
	vals.is_company = additional.isCompany === undefined ? true : additional.isCompany === true;
	// Marks it as a customer, as invoicing it would.
	vals.customer_rank = 1;
	return vals;
}

export function customerDomain(filters: Collection): Domain {
	const domain: Domain = [];
	if (typeof filters.search === 'string' && filters.search.trim()) {
		const text = filters.search.trim();
		domain.push(
			'|',
			'|',
			'|',
			['name', 'ilike', text],
			['vat', 'ilike', text],
			['email', 'ilike', text],
			['ref', 'ilike', text],
		);
	}
	domain.push(
		...buildDomain(filters, {
			vat: { field: 'vat', operator: 'ilike' },
			email: { field: 'email', operator: 'ilike' },
			ref: { field: 'ref', operator: '=' },
		}),
	);
	if (filters.companiesOnly === true) domain.push(['is_company', '=', true]);
	if (filters.excludeDrivers !== false) domain.push(['tms_is_driver', '=', false]);
	return domain;
}
