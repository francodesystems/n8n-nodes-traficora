const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
	advanceCursor,
	detectTransitions,
	newExpiries,
	seedStates,
	windowStart,
	LOOKBACK_SECONDS,
} = require('../dist/nodes/Traficora/polling');

const row = (id, write_date, extra = {}) => ({ id, write_date, ...extra });

test('windowStart goes back the lookback, across midnight too', () => {
	assert.equal(LOOKBACK_SECONDS, 120);
	assert.equal(windowStart('2026-11-18 10:00:00'), '2026-11-18 09:58:00');
	assert.equal(windowStart('2026-11-18 00:01:00', 120), '2026-11-17 23:59:00');
});

test('advanceCursor emits only unseen (id, stamp) pairs and moves the cursor', () => {
	const state = { since: '2026-11-18 10:00:00', seen: ['1@2026-11-18 10:00:00'] };
	const rows = [
		row(1, '2026-11-18 10:00:00'), // already seen
		row(2, '2026-11-18 10:00:00'), // same second, not seen: a late commit
		row(3, '2026-11-18 10:00:05'),
	];
	const { fresh, next } = advanceCursor(rows, 'write_date', state);
	assert.deepEqual(
		fresh.map((r) => r.id),
		[2, 3],
	);
	assert.equal(next.since, '2026-11-18 10:00:05');
	assert.deepEqual(next.seen.sort(), [
		'1@2026-11-18 10:00:00',
		'2@2026-11-18 10:00:00',
		'3@2026-11-18 10:00:05',
	]);
});

test('a record written again (new stamp) is fresh again; the same poll twice emits nothing', () => {
	let state = { since: '2026-11-18 10:00:00', seen: [] };
	const first = advanceCursor([row(1, '2026-11-18 10:00:01')], 'write_date', state);
	state = first.next;
	assert.equal(first.fresh.length, 1);
	const again = advanceCursor([row(1, '2026-11-18 10:00:01')], 'write_date', state);
	assert.equal(again.fresh.length, 0);
	const edited = advanceCursor(
		[row(1, '2026-11-18 10:00:01'), row(1, '2026-11-18 10:00:30')],
		'write_date',
		again.next,
	);
	assert.deepEqual(
		edited.fresh.map((r) => r.write_date),
		['2026-11-18 10:00:30'],
	);
});

test('a transaction that commits late with an older stamp inside the lookback is still caught', () => {
	const state = { since: '2026-11-18 10:05:00', seen: ['9@2026-11-18 10:05:00'] };
	// Stamped 10:04:10 (transaction start) but visible only now: older than «since».
	const { fresh, next } = advanceCursor(
		[row(7, '2026-11-18 10:04:10'), row(9, '2026-11-18 10:05:00')],
		'write_date',
		state,
	);
	assert.deepEqual(
		fresh.map((r) => r.id),
		[7],
	);
	assert.equal(next.since, '2026-11-18 10:05:00');
});

test('seen keeps only pairs inside the lookback window, so static data stays small', () => {
	const old = Array.from({ length: 50 }, (_, i) => `${i}@2026-11-18 09:00:00`);
	const { next } = advanceCursor([row(100, '2026-11-18 10:00:00')], 'write_date', {
		since: '2026-11-18 09:00:00',
		seen: old,
	});
	assert.deepEqual(next.seen, ['100@2026-11-18 10:00:00']);
});

test('records without the stamp field are ignored and nothing moves backwards', () => {
	const { fresh, next } = advanceCursor([{ id: 1 }, row(2, '2026-11-18 09:00:00')], 'write_date', {
		since: '2026-11-18 10:00:00',
		seen: [],
	});
	assert.deepEqual(
		fresh.map((r) => r.id),
		[2],
	);
	assert.equal(next.since, '2026-11-18 10:00:00');
});

test('create_date cursor (New Order)', () => {
	const rows = [
		{ id: 10, create_date: '2026-11-18 10:00:01' },
		{ id: 11, create_date: '2026-11-18 10:00:02' },
	];
	const { fresh, next } = advanceCursor(rows, 'create_date', {
		since: '2026-11-18 10:00:00',
		seen: [],
	});
	assert.equal(fresh.length, 2);
	assert.equal(next.since, '2026-11-18 10:00:02');
});

// ── state transitions ─────────────────────────────────────────────────────

test('detectTransitions reports state changes with the previous state', () => {
	const states = seedStates([
		{ id: 1, state: 'confirmed' },
		{ id: 2, state: 'planned' },
	]);
	const { transitions, states: next } = detectTransitions(
		[
			{ id: 1, state: 'planned', create_date: '2026-11-01 00:00:00' },
			{ id: 2, state: 'planned', create_date: '2026-11-01 00:00:00' }, // edited, same state
		],
		states,
		'2026-11-18 09:58:00',
		'draft',
	);
	assert.deepEqual(
		transitions.map((t) => [t.record.id, t.previousState, t.state]),
		[[1, 'confirmed', 'planned']],
	);
	assert.equal(next.r1, 'planned');
});

test('an unknown record counts only if it is new and already past its initial state', () => {
	const after = '2026-11-18 09:58:00';
	const { transitions, states } = detectTransitions(
		[
			{ id: 5, state: 'confirmed', create_date: '2026-11-18 10:00:00' }, // new, created confirmed
			{ id: 6, state: 'draft', create_date: '2026-11-18 10:00:00' }, // new, still draft
			{ id: 7, state: 'delivered', create_date: '2026-10-01 10:00:00' }, // old, unknown
		],
		{},
		after,
		'draft',
	);
	assert.deepEqual(
		transitions.map((t) => [t.record.id, t.previousState, t.state]),
		[[5, null, 'confirmed']],
	);
	assert.deepEqual(states, { r5: 'confirmed', r6: 'draft', r7: 'delivered' });
	// Next time, 7 is known: a change is reported.
	const later = detectTransitions(
		[{ id: 7, state: 'invoiced', create_date: '2026-10-01 10:00:00' }],
		states,
		after,
		'draft',
	);
	assert.deepEqual(
		later.transitions.map((t) => [t.previousState, t.state]),
		[['delivered', 'invoiced']],
	);
});

test('the state map is capped, dropping the records not seen for longest', () => {
	let states = seedStates(
		[1, 2, 3].map((id) => ({ id, state: 'draft' })),
		3,
	);
	// Touch 1, then add 4: 2 is the oldest now.
	states = detectTransitions([{ id: 1, state: 'draft' }], states, '', 'draft', 3).states;
	states = detectTransitions([{ id: 4, state: 'draft' }], states, '', 'draft', 3).states;
	assert.deepEqual(Object.keys(states), ['r3', 'r1', 'r4']);
});

test('Trip Finished: only transitions into done', () => {
	const states = seedStates([
		{ id: 1, state: 'in_progress' },
		{ id: 2, state: 'planned' },
	]);
	const { transitions } = detectTransitions(
		[
			{ id: 1, state: 'done' },
			{ id: 2, state: 'in_progress' },
		],
		states,
		'2026-11-18 09:58:00',
		'draft',
	);
	assert.deepEqual(
		transitions.filter((t) => t.state === 'done').map((t) => t.record.id),
		[1],
	);
});

// ── expiries ─────────────────────────────────────────────────────────────

test('newExpiries fires once per document and expiry date, again after a renewal', () => {
	const first = newExpiries(
		[
			{ id: 1, date_expiry: '2026-12-01' },
			{ id: 2, date_expiry: '2026-11-20' },
		],
		[],
	);
	assert.equal(first.fresh.length, 2);
	const second = newExpiries(
		[
			{ id: 1, date_expiry: '2026-12-01' },
			{ id: 2, date_expiry: '2026-11-20' },
			{ id: 3, date_expiry: '2026-11-25' },
		],
		first.notified,
	);
	assert.deepEqual(
		second.fresh.map((r) => r.id),
		[3],
	);
	// Document 1 renewed (no longer matching), then entering the window again with a new date.
	const renewed = newExpiries([{ id: 2, date_expiry: '2026-11-20' }], second.notified);
	assert.deepEqual(renewed.notified, ['2@2026-11-20']);
	const again = newExpiries([{ id: 1, date_expiry: '2027-12-01' }], renewed.notified);
	assert.deepEqual(
		again.fresh.map((r) => r.id),
		[1],
	);
});
