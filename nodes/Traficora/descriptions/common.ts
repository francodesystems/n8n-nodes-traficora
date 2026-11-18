import type { INodeProperties } from 'n8n-workflow';

export function returnAllAndLimit(resource: string, operation: string): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: [operation] } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: {
				minValue: 1,
			},
			default: 50,
			description: 'Max number of results to return',
			displayOptions: {
				show: { resource: [resource], operation: [operation], returnAll: [false] },
			},
		},
	];
}

export function idField(
	resource: string,
	operations: string[],
	displayName: string,
	name: string,
	description: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'string',
		required: true,
		default: '',
		placeholder: '42',
		description,
		displayOptions: { show: { resource: [resource], operation: operations } },
	};
}

// Simplify + Options → Fields, on every operation that returns records.
export function outputFields(resource: string, operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Simplify',
			name: 'simple',
			type: 'boolean',
			default: true,
			description: 'Whether to return a simplified version of the response instead of the raw data',
			hint: 'Simplified: a link such as partner_id [7, "ACME"] becomes partner_id 7 and partner_name "ACME", dates and times become ISO 8601 UTC and empty values become null',
			displayOptions: { show: { resource: [resource], operation: operations } },
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: { show: { resource: [resource], operation: operations } },
			options: [
				{
					displayName: 'Fields',
					name: 'fields',
					type: 'string',
					default: '',
					placeholder: 'name,state,partner_id',
					description:
						'Comma-separated Odoo field names to return instead of the default set (the technical names, as in Traficora with developer mode on)',
				},
			],
		},
	];
}

export function customerLocator(
	displayName: string,
	name: string,
	required: boolean,
	description: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required,
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a customer...',
				typeOptions: {
					searchListMethod: 'searchCustomers',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: '42',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^[0-9]+$', errorMessage: 'The ID is a number' },
					},
				],
			},
		],
	};
}

export const ORDER_STATES = [
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Confirmed', value: 'confirmed' },
	{ name: 'Delivered', value: 'delivered' },
	{ name: 'Draft', value: 'draft' },
	{ name: 'In Transit', value: 'in_transit' },
	{ name: 'Invoiced', value: 'invoiced' },
	{ name: 'Planned', value: 'planned' },
];

export const TRIP_STATES = [
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Done', value: 'done' },
	{ name: 'Draft', value: 'draft' },
	{ name: 'In Progress', value: 'in_progress' },
	{ name: 'Planned', value: 'planned' },
];

export const EXPIRY_STATES = [
	{ name: 'Expired', value: 'expired' },
	{ name: 'Expiring Soon', value: 'soon' },
	{ name: 'Valid', value: 'valid' },
];

export const PAID_BY = [
	{ name: 'Company Card', value: 'card' },
	{ name: 'Driver (to Reimburse)', value: 'driver' },
	{ name: 'Supplier Invoice', value: 'invoice' },
];
