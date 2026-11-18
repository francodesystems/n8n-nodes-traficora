import type { INodeProperties } from 'n8n-workflow';

import { customerLocator, idField, ORDER_STATES, outputFields, returnAllAndLimit } from './common';

export const orderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['order'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a transport order (servicio) for a customer',
				action: 'Create an order',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get an order by ID',
				action: 'Get an order',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get orders filtered by state, customer, load date or customer reference',
				action: 'Get many orders',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Change fields of an order',
				action: 'Update an order',
			},
		],
		default: 'getAll',
	},
];

// Shared by Create (additionalFields) and Update (updateFields).
const orderValueFields: INodeProperties[] = [
	{
		displayName: 'Customer Reference',
		name: 'clientRef',
		type: 'string',
		default: '',
		description:
			'The customer’s own order, shipment or delivery note number (client_ref). Printed on the DeCA and the delivery note.',
	},
	{
		displayName: 'Dangerous Goods (ADR)',
		name: 'isAdr',
		type: 'boolean',
		default: false,
		description: 'Whether the goods are dangerous goods under ADR',
	},
	{
		displayName: 'Goods',
		name: 'goodsDescription',
		type: 'string',
		default: '',
		description: 'What is carried',
	},
	{
		displayName: 'Load Address',
		name: 'originAddress',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Load Date',
		name: 'dateLoad',
		type: 'dateTime',
		default: '',
		description: 'When it is loaded. A date without a zone is read in the workflow timezone.',
	},
	{
		displayName: 'Notes',
		name: 'notes',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
	},
	{
		displayName: 'Packages',
		name: 'packages',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
	},
	{
		displayName: 'Price',
		name: 'price',
		type: 'number',
		typeOptions: { minValue: 0, numberPrecision: 2 },
		default: 0,
		description: 'Price of the transport, in the company currency, without VAT',
	},
	{
		displayName: 'Trip ID',
		name: 'tripId',
		type: 'string',
		default: '',
		description:
			'Put the order on this trip (ruta). A confirmed order becomes planned when it gets a trip.',
	},
	{
		displayName: 'Unload Address',
		name: 'destAddress',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Unload Date',
		name: 'dateUnload',
		type: 'dateTime',
		default: '',
		description: 'When it is unloaded. A date without a zone is read in the workflow timezone.',
	},
	{
		displayName: 'Weight (Kg)',
		name: 'weightKg',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
	},
];

export const orderFields: INodeProperties[] = [
	idField(
		'order',
		['get', 'update'],
		'Order ID',
		'orderId',
		'The numeric ID of the order (id in the output), not its reference',
	),

	// create
	{
		...customerLocator('Customer', 'customer', true, 'Who the transport is for'),
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Confirm',
		name: 'confirm',
		type: 'boolean',
		default: false,
		description: 'Whether to confirm the order after creating it (draft → confirmed)',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
		options: orderValueFields,
	},

	// update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['update'] } },
		options: [
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				default: '',
				description: 'Numeric ID of the new customer',
			},
			...orderValueFields,
		],
	},

	// get many
	...returnAllAndLimit('order', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
		options: [
			customerLocator('Customer', 'customer', false, 'Only orders of this customer'),
			{
				displayName: 'Customer Reference',
				name: 'clientRef',
				type: 'string',
				default: '',
				description: 'Orders whose customer reference contains this text',
			},
			{
				displayName: 'Load Date From',
				name: 'dateLoadFrom',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Load Date To',
				name: 'dateLoadTo',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Reference',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Orders whose Traficora reference contains this text',
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'multiOptions',
				options: ORDER_STATES,
				default: [],
				description: 'Only orders in these states',
			},
			{
				displayName: 'Trip ID',
				name: 'tripId',
				type: 'string',
				default: '',
				description: 'Only orders on this trip',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only orders changed after this moment (write_date)',
			},
		],
	},

	...outputFields('order', ['create', 'get', 'getAll', 'update']),
];
