import type { INodeProperties } from 'n8n-workflow';

import { outputFields, returnAllAndLimit } from './common';

export const customerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['customer'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a customer (contact)',
				action: 'Create a customer',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Search customers by name, tax ID or email',
				action: 'Get many customers',
			},
		],
		default: 'getAll',
	},
];

export const customerFields: INodeProperties[] = [
	// create
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Company or person name',
		displayOptions: { show: { resource: ['customer'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['customer'], operation: ['create'] } },
		options: [
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Country Code',
				name: 'countryCode',
				type: 'string',
				default: '',
				placeholder: 'ES',
				description: 'ISO 3166-1 alpha-2 code of the country',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'Internal Reference',
				name: 'ref',
				type: 'string',
				default: '',
				description: 'Your code for this customer, for example its ID in another program',
			},
			{
				displayName: 'Is Company',
				name: 'isCompany',
				type: 'boolean',
				default: true,
				description: 'Whether the customer is a company (false: an individual)',
			},
			{
				displayName: 'Notes',
				name: 'comment',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Postcode',
				name: 'zip',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Street',
				name: 'street',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Tax ID',
				name: 'vat',
				type: 'string',
				default: '',
				placeholder: 'ESB12345678',
				description: 'NIF/CIF or EU VAT number',
			},
		],
	},

	// get many
	...returnAllAndLimit('customer', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['customer'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Companies Only',
				name: 'companiesOnly',
				type: 'boolean',
				default: false,
				description: 'Whether to return only companies (not individuals or contact persons)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Contacts whose email contains this text',
			},
			{
				displayName: 'Exclude Drivers',
				name: 'excludeDrivers',
				type: 'boolean',
				default: true,
				description: 'Whether to leave out contacts marked as drivers in Traficora',
			},
			{
				displayName: 'Internal Reference',
				name: 'ref',
				type: 'string',
				default: '',
				description: 'Exact internal reference',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Name, tax ID, email or reference containing this text',
			},
			{
				displayName: 'Tax ID',
				name: 'vat',
				type: 'string',
				default: '',
				description: 'Contacts whose tax ID contains this text',
			},
		],
	},

	...outputFields('customer', ['create', 'getAll']),
];
