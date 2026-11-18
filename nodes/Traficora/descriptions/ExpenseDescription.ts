import type { INodeProperties } from 'n8n-workflow';

import { outputFields, PAID_BY, returnAllAndLimit } from './common';

export const expenseOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['tripExpense'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Add an expense to a trip: a fuel ticket with its litres, a toll, a meal…',
				action: 'Create a trip expense',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get trip expenses filtered by trip, vehicle, driver, type or date',
				action: 'Get many trip expenses',
			},
		],
		default: 'create',
	},
	{
		displayName:
			'Trip expenses need the Traficora module «Gastos y margen» (tms_cost). They count towards the trip margin; nothing is posted in accounting.',
		name: 'expenseNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['tripExpense'] } },
	},
];

export const expenseFields: INodeProperties[] = [
	// create
	{
		displayName: 'Trip ID',
		name: 'tripId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '42',
		description: 'The numeric ID of the trip the expense belongs to',
		displayOptions: { show: { resource: ['tripExpense'], operation: ['create'] } },
	},
	{
		displayName: 'Expense Type Name or ID',
		name: 'typeId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getExpenseTypes' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['tripExpense'], operation: ['create'] } },
	},
	{
		displayName: 'Ticket Total',
		name: 'amountTotal',
		type: 'number',
		typeOptions: { minValue: 0, numberPrecision: 2 },
		required: true,
		default: 0,
		description:
			'What was paid, VAT included. Traficora works out the amount without VAT from the usual VAT of the type, unless you set Amount Without VAT.',
		displayOptions: { show: { resource: ['tripExpense'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['tripExpense'], operation: ['create'] } },
		options: [
			{
				displayName: 'Amount Without VAT',
				name: 'amount',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 2 },
				default: 0,
				description: 'What counts for the margin. Leave it out to let Traficora compute it.',
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'dateTime',
				default: '',
				description: 'Day of the expense. Today if empty.',
			},
			{
				displayName: 'Litres',
				name: 'liters',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 2 },
				default: 0,
				description: 'For fuel: they count for the trip consumption (L/100 km)',
			},
			{
				displayName: 'Note',
				name: 'note',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Paid By',
				name: 'paidBy',
				type: 'options',
				options: PAID_BY,
				default: 'card',
				description: 'A ticket the driver paid stays pending reimbursement',
			},
			{
				displayName: 'Supplier ID',
				name: 'supplierId',
				type: 'string',
				default: '',
				description: 'Numeric ID of the supplier contact (the petrol station, the motorway…)',
			},
		],
	},

	// get many
	...returnAllAndLimit('tripExpense', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['tripExpense'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Date From',
				name: 'dateFrom',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Date To',
				name: 'dateTo',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Driver Name or ID',
				name: 'driverId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDrivers' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Expense Type Name or ID',
				name: 'typeId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getExpenseTypes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Fuel Only',
				name: 'fuelOnly',
				type: 'boolean',
				default: false,
				description: 'Whether to return only fuel expenses',
			},
			{
				displayName: 'Paid By',
				name: 'paidBy',
				type: 'options',
				options: [{ name: 'Any', value: '' }, ...PAID_BY],
				default: '',
			},
			{
				displayName: 'Trip ID',
				name: 'tripId',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Vehicle Name or ID',
				name: 'vehicleId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getVehicles' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
		],
	},

	...outputFields('tripExpense', ['create', 'getAll']),
];
