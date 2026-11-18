import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import {
	collectOffsetPages,
	jsonUrl,
	normalizeBaseUrl,
	odooErrorHint,
	odooErrorOf,
	type Domain,
} from './odoo';

export type Context = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export interface CallOptions {
	itemIndex?: number;
}

function toApiError(
	this: Context,
	error: unknown,
	model: string,
	method: string,
	options: CallOptions,
): NodeApiError {
	const extra = options.itemIndex === undefined ? {} : { itemIndex: options.itemIndex };
	const odoo = odooErrorOf(error);
	if (odoo) {
		const hint = odooErrorHint(odoo, model);
		return new NodeApiError(this.getNode(), error as JsonObject, {
			message: odoo.message,
			description: `Traficora (Odoo) error ${odoo.name} on ${model}/${method}.${hint ? ` ${hint}` : ''}`,
			...extra,
		});
	}
	return new NodeApiError(this.getNode(), error as JsonObject, extra);
}

// POST {baseUrl}/json/2/{model}/{method} with the method's keyword arguments
// (plus `ids` for record methods and an optional `context`) as the JSON body.
export async function traficoraCall(
	this: Context,
	model: string,
	method: string,
	body: IDataObject = {},
	options: CallOptions = {},
): Promise<unknown> {
	const credentials = await this.getCredentials('traficoraApi');
	const baseUrl = normalizeBaseUrl(credentials.baseUrl);
	if (!baseUrl) {
		throw new NodeOperationError(
			this.getNode(),
			'Set the Base URL of your Traficora instance in the credential',
			{
				itemIndex: options.itemIndex,
			},
		);
	}
	const request: IHttpRequestOptions = {
		method: 'POST',
		url: jsonUrl(baseUrl, model, method),
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		body,
		json: true,
	};
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'traficoraApi', request);
	} catch (error) {
		throw toApiError.call(this, error, model, method, options);
	}
}

export interface SearchOptions {
	fields: string[];
	order?: string;
	context?: IDataObject;
}

export async function searchRead(
	this: Context,
	model: string,
	domain: Domain,
	search: SearchOptions,
	limit: number | null,
	options: CallOptions = {},
): Promise<IDataObject[]> {
	return collectOffsetPages(async (offset, pageSize) => {
		const body: IDataObject = { domain, fields: search.fields, offset, limit: pageSize };
		if (search.order) body.order = search.order;
		if (search.context) body.context = search.context;
		const rows = await traficoraCall.call(this, model, 'search_read', body, options);
		return Array.isArray(rows) ? (rows as IDataObject[]) : [];
	}, limit);
}

// Field → type of a model (fields_get), or null if it cannot be read.
// Cached per node run: the defaults drop the fields an instance does not have
// (margins without tms_cost) and Simplify knows which fields are many2one.
export async function fieldTypes(
	this: Context,
	model: string,
	cache: Map<string, Record<string, string> | null>,
	options: CallOptions = {},
): Promise<Record<string, string> | null> {
	if (cache.has(model)) return cache.get(model) ?? null;
	let types: Record<string, string> | null = null;
	try {
		const result = (await traficoraCall.call(
			this,
			model,
			'fields_get',
			{ attributes: ['type'] },
			options,
		)) as Record<string, { type?: string }>;
		types = {};
		for (const [field, info] of Object.entries(result ?? {})) {
			if (info && typeof info.type === 'string') types[field] = info.type;
		}
	} catch (error) {
		// A missing model is a real error (module not installed): let it through.
		const missingModel =
			error instanceof NodeApiError && /does not exist/.test(error.message) ? error : null;
		if (missingModel) throw missingModel;
		types = null;
	}
	cache.set(model, types);
	return types;
}
