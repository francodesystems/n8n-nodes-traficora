import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { customerFields, customerOperations } from './descriptions/CustomerDescription';
import { expenseFields, expenseOperations } from './descriptions/ExpenseDescription';
import { expiryFields, expiryOperations } from './descriptions/ExpiryDescription';
import { orderFields, orderOperations } from './descriptions/OrderDescription';
import { tripFields, tripOperations } from './descriptions/TripDescription';
import { vehicleFields, vehicleOperations } from './descriptions/VehicleDescription';
import { fieldTypes, searchRead, traficoraCall, type Context } from './GenericFunctions';
import {
	buildCustomerVals,
	buildExpenseVals,
	buildOrderVals,
	customerDomain,
	DEFAULT_FIELDS,
	expenseDomain,
	expiryDomain,
	InputError,
	MODELS,
	orderDomain,
	tripDomain,
	vehicleDomain,
} from './models';
import { localDate, selectFields, simplifyRecord, splitFields, toId, type Domain } from './odoo';

async function optionsOf(
	this: ILoadOptionsFunctions,
	model: string,
	domain: Domain,
	label: (row: IDataObject) => string,
	fields: string[] = ['id', 'display_name'],
): Promise<INodePropertyOptions[]> {
	const rows = await searchRead.call(this, model, domain, { fields }, 500);
	return rows.map((row) => ({ name: label(row), value: row.id as number }));
}

export class Traficora implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Traficora',
		name: 'traficora',
		icon: { light: 'file:traficora.svg', dark: 'file:traficora.dark.svg' },
		group: ['transform'],
		version: 1,
		usableAsTool: true,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Transport orders, trips and their margin, trip expenses, expiring documents, vehicles and customers in Traficora, the Spanish TMS built on Odoo',
		defaults: {
			name: 'Traficora',
		},
		// eslint-plugin-n8n-nodes-base@1.16.x predates NodeConnectionTypes and only
		// recognizes the 'main' string literal; the enum is the current n8n standard.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [NodeConnectionTypes.Main],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'traficoraApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Expiring Document', value: 'expiry' },
					{ name: 'Order', value: 'order' },
					{ name: 'Trip', value: 'trip' },
					{ name: 'Trip Expense', value: 'tripExpense' },
					{ name: 'Vehicle', value: 'vehicle' },
				],
				default: 'order',
			},
			...orderOperations,
			...orderFields,
			...tripOperations,
			...tripFields,
			...expenseOperations,
			...expenseFields,
			...expiryOperations,
			...expiryFields,
			...vehicleOperations,
			...vehicleFields,
			...customerOperations,
			...customerFields,
		],
	};

	methods = {
		loadOptions: {
			async getVehicles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return optionsOf.call(
					this,
					MODELS.vehicle,
					[],
					(row) => {
						const plate = typeof row.license_plate === 'string' ? row.license_plate : '';
						const name = typeof row.name === 'string' ? row.name : String(row.id);
						return plate && !name.includes(plate) ? `${plate} · ${name}` : name;
					},
					['id', 'name', 'license_plate'],
				);
			},
			async getDrivers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return optionsOf.call(this, MODELS.customer, [['tms_is_driver', '=', true]], (row) =>
					String(row.display_name ?? row.id),
				);
			},
			async getExpenseTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return optionsOf.call(
					this,
					MODELS.expenseType,
					[],
					(row) =>
						row.is_fuel ? `${String(row.display_name)} (fuel)` : String(row.display_name ?? row.id),
					['id', 'display_name', 'is_fuel'],
				);
			},
			async getExpiryTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return optionsOf.call(this, MODELS.expiryType, [], (row) =>
					String(row.display_name ?? row.id),
				);
			},
		},
		listSearch: {
			async searchCustomers(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const offset = Number(paginationToken) || 0;
				const pageSize = 100;
				const domain = customerDomain({ search: filter ?? '', excludeDrivers: true });
				const rows = (await traficoraCall.call(this as Context, MODELS.customer, 'search_read', {
					domain,
					fields: ['id', 'display_name', 'vat'],
					offset,
					limit: pageSize,
					order: 'name asc, id asc',
				})) as IDataObject[];
				const list = Array.isArray(rows) ? rows : [];
				return {
					results: list.map((row) => ({
						name: row.vat
							? `${String(row.display_name)} (${String(row.vat)})`
							: String(row.display_name),
						value: String(row.id),
					})),
					paginationToken: list.length === pageSize ? String(offset + pageSize) : undefined,
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const typesCache = new Map<string, Record<string, string> | null>();
		const timeZone = this.getTimezone();

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const opts = { itemIndex: i };
				const fail = (message: string) =>
					new NodeOperationError(this.getNode(), message, { itemIndex: i });

				const model = MODELS[resource as keyof typeof MODELS];
				const call = (method: string, body: IDataObject) =>
					traficoraCall.call(this, model, method, body, opts);
				const idParam = (name: string, label: string): number => {
					const id = toId(this.getNodeParameter(name, i));
					if (!id) throw fail(`${label} must be a numeric ID`);
					return id;
				};

				// Output: the default fields this instance has (or the ones asked for), simplified or raw.
				const output = async () => {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const types = await fieldTypes.call(this, model, typesCache, opts);
					const fields = selectFields(DEFAULT_FIELDS[model], types, splitFields(options.fields));
					const simple = this.getNodeParameter('simple', i, true) as boolean;
					const shape = (rows: IDataObject[]) =>
						simple ? rows.map((row) => simplifyRecord(row, types)) : rows;
					return { fields, shape };
				};
				const readIds = async (ids: number[]) => {
					const { fields, shape } = await output();
					const rows = (await call('read', { ids, fields })) as IDataObject[];
					if (!Array.isArray(rows) || rows.length === 0)
						throw fail(`No ${resource} with ID ${ids.join(', ')}`);
					return shape(rows);
				};
				const list = async (domain: Domain, context?: IDataObject) => {
					const { fields, shape } = await output();
					const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
					const limit = returnAll ? null : (this.getNodeParameter('limit', i, 50) as number);
					const rows = await searchRead.call(this, model, domain, { fields, context }, limit, opts);
					return shape(rows);
				};
				const createOne = async (vals: IDataObject): Promise<number> => {
					const ids = (await call('create', { vals_list: [vals] })) as number[];
					const id = Array.isArray(ids) ? ids[0] : (ids as unknown as number);
					if (typeof id !== 'number') throw fail('Traficora did not return the new record ID');
					return id;
				};
				const filters = () => this.getNodeParameter('filters', i, {}) as IDataObject;

				let result: IDataObject[] | undefined;

				if (resource === 'order') {
					if (operation === 'create') {
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const customer = toId(this.getNodeParameter('customer', i, '', { extractValue: true }));
						if (!customer) throw fail('Choose the customer');
						const vals = { ...buildOrderVals(additional, timeZone), partner_id: customer };
						const id = await createOne(vals);
						if (this.getNodeParameter('confirm', i, false) as boolean) {
							await call('action_confirm', { ids: [id] });
						}
						result = await readIds([id]);
					} else if (operation === 'get') {
						result = await readIds([idParam('orderId', 'Order ID')]);
					} else if (operation === 'getAll') {
						result = await list(orderDomain(filters(), timeZone));
					} else if (operation === 'update') {
						const id = idParam('orderId', 'Order ID');
						const vals = buildOrderVals(
							this.getNodeParameter('updateFields', i, {}) as IDataObject,
							timeZone,
						);
						if (!Object.keys(vals).length) throw fail('Add at least one field to update');
						await call('write', { ids: [id], vals });
						result = await readIds([id]);
					}
				} else if (resource === 'trip') {
					if (operation === 'get') {
						result = await readIds([idParam('tripId', 'Trip ID')]);
					} else if (operation === 'getAll') {
						result = await list(tripDomain(filters(), timeZone));
					}
				} else if (resource === 'tripExpense') {
					if (operation === 'create') {
						const vals = buildExpenseVals(
							this.getNodeParameter('tripId', i),
							this.getNodeParameter('typeId', i),
							this.getNodeParameter('amountTotal', i),
							this.getNodeParameter('additionalFields', i, {}) as IDataObject,
							timeZone,
						);
						result = await readIds([await createOne(vals)]);
					} else if (operation === 'getAll') {
						result = await list(expenseDomain(filters(), timeZone));
					}
				} else if (resource === 'expiry') {
					if (operation === 'getAll') {
						const today = localDate(new Date(), timeZone);
						result = await list(expiryDomain(filters(), today));
					}
				} else if (resource === 'vehicle') {
					if (operation === 'get') {
						result = await readIds([idParam('vehicleId', 'Vehicle ID')]);
					} else if (operation === 'getAll') {
						result = await list(vehicleDomain(filters()));
					}
				} else if (resource === 'customer') {
					if (operation === 'create') {
						const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const vals = buildCustomerVals(this.getNodeParameter('name', i) as string, additional);
						const code =
							typeof additional.countryCode === 'string' ? additional.countryCode.trim() : '';
						if (code) {
							const countries = (await traficoraCall.call(
								this,
								MODELS.country,
								'search_read',
								{ domain: [['code', '=ilike', code]], fields: ['id'], limit: 1 },
								opts,
							)) as IDataObject[];
							if (!Array.isArray(countries) || !countries.length)
								throw fail(`Unknown country code: ${code}`);
							vals.country_id = countries[0].id as number;
						}
						result = await readIds([await createOne(vals)]);
					} else if (operation === 'getAll') {
						result = await list(customerDomain(filters()));
					}
				}

				if (result === undefined) throw fail(`Unknown operation: ${resource} ${operation}`);
				for (const row of result) {
					returnData.push({ json: row, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Request errors already are NodeApiError with the Odoo message and the item index.
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: error instanceof InputError
							? new NodeOperationError(this.getNode(), error.message, { itemIndex: i })
							: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				throw failure;
			}
		}

		return [returnData];
	}
}
