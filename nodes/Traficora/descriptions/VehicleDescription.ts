import type { INodeProperties } from 'n8n-workflow';

import { idField, outputFields, returnAllAndLimit } from './common';

export const vehicleOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['vehicle'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a vehicle (tractor, rigid truck, trailer, van…) of the fleet',
				action: 'Get a vehicle',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the vehicles of the fleet',
				action: 'Get many vehicles',
			},
		],
		default: 'getAll',
	},
];

export const vehicleFields: INodeProperties[] = [
	idField('vehicle', ['get'], 'Vehicle ID', 'vehicleId', 'The numeric ID of the vehicle'),

	...returnAllAndLimit('vehicle', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['vehicle'], operation: ['getAll'] } },
		options: [
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
				displayName: 'Include Archived',
				name: 'includeArchived',
				type: 'boolean',
				default: false,
				description: 'Whether to include archived vehicles (sold or out of service)',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				placeholder: '1234 ABC',
				description: 'Vehicles whose name or licence plate contains this text',
			},
		],
	},

	...outputFields('vehicle', ['get', 'getAll']),
];
