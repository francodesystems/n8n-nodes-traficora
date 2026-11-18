import type { INodeProperties } from 'n8n-workflow';

import { EXPIRY_STATES, outputFields, returnAllAndLimit } from './common';

export const expiryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['expiry'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'Get vehicle and driver documents with an expiry date (MOT/ITV, insurance, licence, CAP, ADR…)',
				action: 'Get many expiring documents',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Expiring documents need the Traficora module «Caducidades» (tms_expiry)',
		name: 'expiryNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['expiry'] } },
	},
];

export const expiryFields: INodeProperties[] = [
	...returnAllAndLimit('expiry', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['expiry'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Document Type Name or ID',
				name: 'typeId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getExpiryTypes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
				displayName: 'Expiring Within (Days)',
				name: 'withinDays',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 30,
				description:
					'Documents that expire in the next N days, already expired ones included (date_expiry ≤ today + N, today in the workflow timezone)',
			},
			{
				displayName: 'Only Active Vehicles and Drivers',
				name: 'activeHolders',
				type: 'boolean',
				default: true,
				description:
					'Whether to leave out documents of archived vehicles (sold) and drivers (who left), as Traficora does for its own alerts',
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'multiOptions',
				options: EXPIRY_STATES,
				default: [],
				description:
					'Only documents in these states. Expiring Soon uses the notice days of each document type.',
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

	...outputFields('expiry', ['getAll']),
];
