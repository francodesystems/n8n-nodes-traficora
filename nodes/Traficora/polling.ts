// Polling cursor logic for the Traficora Trigger, kept pure for unit tests.
//
// Odoo gives write_date / create_date to the second, and a transaction stamps
// them when it starts, so a record can show up with a stamp slightly older than
// one already read. Each poll therefore reads from `since − LOOKBACK` and skips
// the (id, stamp) pairs it has already seen; `seen` only keeps pairs inside the
// window, so it stays small.
import type { IDataObject } from 'n8n-workflow';

import { formatOdooDatetime, parseOdooDatetime } from './odoo';

export const LOOKBACK_SECONDS = 120;

export interface CursorState {
	since: string; // Odoo UTC datetime, the newest stamp read so far
	seen: string[]; // `${id}@${stamp}` read inside the lookback window
}

export function windowStart(since: string, lookbackSeconds = LOOKBACK_SECONDS): string {
	return formatOdooDatetime(new Date(parseOdooDatetime(since).getTime() - lookbackSeconds * 1000));
}

function keyOf(record: IDataObject, stampField: string): string {
	return `${String(record.id)}@${String(record[stampField])}`;
}

// Records not seen before, and the cursor to store for the next poll.
export function advanceCursor(
	records: IDataObject[],
	stampField: string,
	state: CursorState,
	lookbackSeconds = LOOKBACK_SECONDS,
): { fresh: IDataObject[]; next: CursorState } {
	const seen = new Set(state.seen);
	const fresh: IDataObject[] = [];
	let since = state.since;
	for (const record of records) {
		const stamp = record[stampField];
		if (typeof stamp !== 'string') continue;
		const key = keyOf(record, stampField);
		if (!seen.has(key)) {
			fresh.push(record);
			seen.add(key);
		}
		if (stamp > since) since = stamp;
	}
	const from = windowStart(since, lookbackSeconds);
	const kept = Array.from(seen).filter((key) => key.slice(key.indexOf('@') + 1) >= from);
	return { fresh, next: { since, seen: kept } };
}

// ── State transitions (Order Status Changed, Trip Finished) ──────────────────

export const MAX_TRACKED_STATES = 20000;

export interface Transition {
	record: IDataObject;
	previousState: string | null;
	state: string;
}

// Compares each changed record with the last state known for it.
// A record never seen before only counts when it was created inside this poll's
// window (a new record that is not in its initial state any more); older unknown
// records are just remembered, since their previous state is unknown.
export function detectTransitions(
	records: IDataObject[],
	states: Record<string, string>,
	createdAfter: string,
	initialState: string,
	maxTracked = MAX_TRACKED_STATES,
): { transitions: Transition[]; states: Record<string, string> } {
	const next: Record<string, string> = { ...states };
	const transitions: Transition[] = [];
	for (const record of records) {
		// Prefixed: integer-like keys would be sorted by number, not by insertion.
		const id = `r${String(record.id)}`;
		const state = typeof record.state === 'string' ? record.state : null;
		if (state === null) continue;
		const previous = id in next ? next[id] : undefined;
		if (previous === undefined) {
			const created = typeof record.create_date === 'string' ? record.create_date : '';
			if (created >= createdAfter && state !== initialState)
				transitions.push({ record, previousState: null, state });
		} else if (previous !== state) {
			transitions.push({ record, previousState: previous, state });
		}
		// Re-inserting moves the record to the end, so the oldest tracked go first.
		delete next[id];
		next[id] = state;
	}
	const ids = Object.keys(next);
	for (let i = 0; i < ids.length - maxTracked; i++) delete next[ids[i]];
	return { transitions, states: next };
}

// ── Document Expiring Soon ───────────────────────────────────────────────────

// One alert per document and expiry date: renewing it (a new date) can alert again.
// Keys of documents that no longer match are dropped, so the list stays bounded.
export function newExpiries(
	records: IDataObject[],
	notified: string[],
): { fresh: IDataObject[]; notified: string[] } {
	const before = new Set(notified);
	const fresh: IDataObject[] = [];
	const now: string[] = [];
	for (const record of records) {
		const key = `${String(record.id)}@${String(record.date_expiry)}`;
		now.push(key);
		if (!before.has(key)) fresh.push(record);
	}
	return { fresh, notified: now };
}

// The state of each record, without detecting anything (first poll).
export function seedStates(
	records: IDataObject[],
	maxTracked = MAX_TRACKED_STATES,
): Record<string, string> {
	return detectTransitions(records, {}, '\uffff', '', maxTracked).states;
}
