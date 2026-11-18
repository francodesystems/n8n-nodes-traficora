import type { INodeProperties } from 'n8n-workflow';

import { idField, outputFields, returnAllAndLimit, TRIP_STATES } from './common';

export const tripOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['trip'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a trip (ruta) with its revenue, costs and margin',
				action: 'Get a trip',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get trips filtered by state, vehicle, driver or departure date',
				action: 'Get many trips',
			},
		],
		default: 'getAll',
	},
	{
		displayName:
			'Revenue, costs, margin, fuel litres and cost per km come with the Traficora module «Gastos y margen» (tms_cost). Without it, trips are returned without them.',
		name: 'marginNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['trip'] } },
	},
];

export const tripFields: INodeProperties[] = [
	idField('trip', ['get'], 'Trip ID', 'tripId', 'The numeric ID of the trip (id in the output)'),

	...returnAllAndLimit('trip', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['trip'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Departure From',
				name: 'dateFrom',
				type: 'dateTime',
				default: '',
				description: 'Trips leaving at or after this moment (date_start)',
			},
			{
				displayName: 'Departure To',
				name: 'dateTo',
				type: 'dateTime',
				default: '',
				description: 'Trips leaving at or before this moment (date_start)',
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
				displayName: 'State',
				name: 'state',
				type: 'multiOptions',
				options: TRIP_STATES,
				default: [],
				description: 'Only trips in these states',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only trips changed after this moment (write_date)',
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

	...outputFields('trip', ['get', 'getAll']),
];
