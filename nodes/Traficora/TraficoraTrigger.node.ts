import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { ORDER_STATES } from './descriptions/common';
import { fieldTypes, searchRead } from './GenericFunctions';
import { ACTIVE_HOLDER_DOMAIN, DEFAULT_FIELDS, MODELS } from './models';
import { addDays, localDate, selectFields, simplifyRecord, type Domain } from './odoo';
import {
	advanceCursor,
	detectTransitions,
	newExpiries,
	seedStates,
	windowStart,
	type CursorState,
} from './polling';

// Records read per poll at most; the cursor moves on, so a bigger backlog
// comes out over the next polls.
const MAX_PER_POLL = 1000;

interface EventSpec {
	model: string;
	stampField: 'create_date' | 'write_date';
	domain: Domain;
}

const EVENTS: Record<string, EventSpec> = {
	newOrder: { model: MODELS.order, stampField: 'create_date', domain: [] },
	orderStatusChanged: { model: MODELS.order, stampField: 'write_date', domain: [] },
	tripFinished: { model: MODELS.trip, stampField: 'write_date', domain: [] },
};

// States a record can still leave: the state map is seeded with these on activation.
const OPEN_STATES: Record<string, string[]> = {
	[MODELS.order]: ['draft', 'confirmed', 'planned', 'in_transit', 'delivered'],
	[MODELS.trip]: ['draft', 'planned', 'in_progress'],
};

interface StaticData extends IDataObject {
	event?: string;
	cursor?: CursorState;
	states?: Record<string, string>;
	notified?: string[];
}

export class TraficoraTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Traficora Trigger',
		name: 'traficoraTrigger',
		icon: { light: 'file:traficora.svg', dark: 'file:traficora.dark.svg' },
		group: ['trigger'],
		version: 1,
		// A trigger is never usable as an AI tool. n8n's type only permits `true`
		// (undefined already means "not a tool"), so we cast to declare it explicitly.
		usableAsTool: false as unknown as undefined,
		subtitle: '={{$parameter["event"]}}',
		description:
			'Starts the workflow when an order is created or changes state, a trip is finished or a vehicle or driver document is about to expire in Traficora (polling)',
		defaults: {
			name: 'Traficora Trigger',
		},
		polling: true,
		inputs: [],
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
				displayName:
					'Traficora (Odoo) has no webhooks for this, so the trigger asks it for changes on the schedule below. The first poll after activating only remembers where things are; from then on, each change starts the workflow once.',
				name: 'pollingNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Document Expiring Soon',
						value: 'documentExpiring',
						description:
							'A vehicle or driver document enters its notice period or expires (needs the Caducidades module, tms_expiry). Once per document and expiry date.',
					},
					{
						name: 'New Order',
						value: 'newOrder',
						description: 'A transport order (servicio) was created',
					},
					{
						name: 'Order Status Changed',
						value: 'orderStatusChanged',
						description:
							'An order moved to another state (confirmed, planned, in transit, delivered…)',
					},
					{
						name: 'Trip Finished',
						value: 'tripFinished',
						description: 'A trip (ruta) was marked as done',
					},
				],
				default: 'newOrder',
			},
			{
				displayName: 'To States',
				name: 'toStates',
				type: 'multiOptions',
				options: ORDER_STATES,
				default: [],
				description: 'Only fire when the order moves to one of these states. Empty: any state.',
				displayOptions: { show: { event: ['orderStatusChanged'] } },
			},
			{
				displayName: 'Days Ahead',
				name: 'daysAhead',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description:
					'0 uses the notice days of each document type in Traficora (state Expiring Soon or Expired). Another number fires for documents that expire within that many days, already expired ones included.',
				displayOptions: { show: { event: ['documentExpiring'] } },
			},
			{
				displayName: 'Simplify',
				name: 'simple',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a simplified version of the response instead of the raw data',
				hint: 'Simplified: partner_id [7, "ACME"] becomes partner_id 7 and partner_name "ACME", dates and times become ISO 8601 UTC and empty values become null',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const simple = this.getNodeParameter('simple', true) as boolean;
		const manual = this.getMode() === 'manual';
		const timeZone = this.getTimezone();
		const data = this.getWorkflowStaticData('node') as StaticData;
		// Another event selected since the last poll: start over.
		if (data.event !== event) {
			delete data.cursor;
			delete data.states;
			delete data.notified;
			data.event = event;
		}

		const model = event === 'documentExpiring' ? MODELS.expiry : EVENTS[event].model;
		const types = await fieldTypes.call(this, model, new Map());
		const fields = selectFields(DEFAULT_FIELDS[model], types);
		const shape = (rows: IDataObject[]) =>
			simple ? rows.map((row) => simplifyRecord(row, types)) : rows;
		const emit = (rows: IDataObject[]) =>
			rows.length ? [this.helpers.returnJsonArray(shape(rows))] : null;

		if (event === 'documentExpiring') {
			const daysAhead = this.getNodeParameter('daysAhead', 0) as number;
			const today = localDate(new Date(), timeZone);
			const domain: Domain = [
				...(daysAhead > 0
					? [
							['date_expiry', '<=', addDays(today, Math.floor(daysAhead))] as [
								string,
								string,
								unknown,
							],
						]
					: [['state', 'in', ['soon', 'expired']] as [string, string, unknown]]),
				...ACTIVE_HOLDER_DOMAIN,
			];
			if (manual) {
				const sample = await searchRead.call(this, model, domain, { fields }, 1);
				return emit(sample);
			}
			const rows = await searchRead.call(
				this,
				model,
				domain,
				{ fields, order: 'date_expiry asc, id asc' },
				null,
			);
			const firstRun = data.notified === undefined;
			const { fresh, notified } = newExpiries(rows, data.notified ?? []);
			data.notified = notified;
			return firstRun ? null : emit(fresh);
		}

		const spec = EVENTS[event];
		const stamp = spec.stampField;

		if (manual) {
			// A sample: the latest matching record, nothing stored.
			const sampleDomain: Domain =
				event === 'tripFinished' ? [['state', '=', 'done']] : spec.domain;
			const sample = await searchRead.call(
				this,
				model,
				sampleDomain,
				{ fields, order: `${stamp} desc, id desc` },
				1,
			);
			return emit(sample);
		}

		const readFields = Array.from(new Set([...fields, 'id', 'state', 'create_date', stamp]));
		const readSince = (since: string, limit: number | null) =>
			searchRead.call(
				this,
				model,
				[...spec.domain, [stamp, '>=', windowStart(since)]],
				{ fields: readFields, order: `${stamp} asc, id asc` },
				limit,
			);

		if (!data.cursor) {
			// First poll: start at the newest stamp in Traficora (not this machine's clock)
			// and remember what is inside the lookback window without emitting.
			const latest = await searchRead.call(
				this,
				model,
				spec.domain,
				{ fields: ['id', stamp], order: `${stamp} desc, id desc` },
				1,
			);
			const since =
				typeof latest[0]?.[stamp] === 'string'
					? (latest[0][stamp] as string)
					: '1970-01-01 00:00:00';
			const windowRows = await readSince(since, MAX_PER_POLL);
			data.cursor = advanceCursor(windowRows, stamp, { since, seen: [] }).next;
			if (event !== 'newOrder') {
				const open = await searchRead.call(
					this,
					model,
					[['state', 'in', OPEN_STATES[model]]],
					{ fields: ['id', 'state'] },
					null,
				);
				data.states = seedStates([...open, ...windowRows]);
			}
			return null;
		}

		const previous = data.cursor;
		const rows = await readSince(previous.since, MAX_PER_POLL);
		const { fresh, next } = advanceCursor(rows, stamp, previous);
		data.cursor = next;

		if (event === 'newOrder') return emit(fresh);

		const { transitions, states } = detectTransitions(
			fresh,
			data.states ?? {},
			windowStart(previous.since),
			'draft',
		);
		data.states = states;

		let matching = transitions;
		if (event === 'tripFinished') {
			matching = transitions.filter((t) => t.state === 'done');
		} else {
			const toStates = this.getNodeParameter('toStates', []) as string[];
			if (toStates.length) matching = transitions.filter((t) => toStates.includes(t.state));
		}
		if (!matching.length) return null;
		const out = shape(matching.map((t) => t.record)).map((row, index) => {
			const previousState = matching[index].previousState;
			return event === 'orderStatusChanged' ? { ...row, previous_state: previousState } : row;
		});
		return [this.helpers.returnJsonArray(out)];
	}
}
