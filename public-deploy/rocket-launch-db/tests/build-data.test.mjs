import test from 'node:test';
import assert from 'node:assert/strict';

import { applyLifecycle, buildOutputs, canonicalStatus, normalizeLl2 } from '../scripts/build-data.mjs';

const NOW = new Date('2026-07-18T05:00:00Z');

function launch(id, net, status) {
  return {
    id,
    name: `Mission ${id}`,
    net,
    status: { name: status },
    rocket: { configuration: { id: 1, full_name: 'Test Rocket' } },
    launch_service_provider: { id: 2, name: 'Test Provider' },
    pad: { id: 3, name: 'Pad A', location: { id: 4, name: 'Test Site' }, country: { name: 'Testland' } },
    mission: { orbit: { abbrev: 'LEO' } },
  };
}

test('canonical status recognizes terminal and scheduled LL2 states', () => {
  assert.equal(canonicalStatus({ name: 'Launch Successful' }), 'success');
  assert.equal(canonicalStatus({ name: 'Launch Failure' }), 'failure');
  assert.equal(canonicalStatus({ name: 'Go for Launch' }), 'go');
  assert.equal(canonicalStatus({ name: 'To Be Confirmed' }), 'tbc');
});

test('time alone produces pending confirmation, never fake success', () => {
  const record = applyLifecycle({ net: '2026-07-18T04:00:00Z', status: 'go' }, NOW);
  assert.equal(record.status, 'window_elapsed');
  assert.equal(record.lifecycle, 'pending_confirmation');
  assert.equal(record.confirmed_terminal, false);
});

test('LL2 terminal result moves a launch into history', () => {
  const record = normalizeLl2(launch('done', '2026-07-17T04:00:00Z', 'Launch Successful'), NOW);
  assert.equal(record.status, 'success');
  assert.equal(record.lifecycle, 'history');
  assert.equal(record.site, 'Test Site · Pad A');
});

test('outputs keep future launches separate from elapsed unconfirmed windows', () => {
  const outputs = buildOutputs({
    existingLaunches: [],
    upcomingRaw: [
      launch('future', '2026-07-18T06:00:00Z', 'Go for Launch'),
      launch('elapsed', '2026-07-18T04:00:00Z', 'Go for Launch'),
    ],
    previousRaw: [launch('done', '2026-07-17T04:00:00Z', 'Launch Successful')],
    now: NOW,
  });
  assert.deepEqual(outputs.upcoming.records.map(record => record.launch_id), ['ll2:future']);
  assert.deepEqual(outputs.upcoming.pending_confirmation.map(record => record.launch_id), ['ll2:elapsed']);
  assert.equal(outputs.launches.records.find(record => record.launch_id === 'll2:done').status, 'success');
});

test('preserved GCAT orbital successes remain history, not pending confirmation', () => {
  const outputs = buildOutputs({
    existingLaunches: [{ launch_id: 'gcat:2026-001', net: '2026-01-01', orbpay: 'OS', sources: ['GCAT'] }],
    upcomingRaw: [launch('future', '2026-07-18T06:00:00Z', 'Go for Launch')],
    previousRaw: [],
    now: NOW,
  });
  const gcat = outputs.launches.records.find(record => record.launch_id === 'gcat:2026-001');
  assert.equal(gcat.status, 'success');
  assert.equal(gcat.lifecycle, 'history');
  assert.equal(outputs.upcoming.pending_confirmation_count, 0);
});

test('ambiguous GCAT rows remain historical instead of polluting pending confirmation', () => {
  const outputs = buildOutputs({
    existingLaunches: [{ launch_id: 'gcat:2026-002', net: '2026-02-01', orbpay: '16.100 SPX', sources: ['GCAT'] }],
    upcomingRaw: [launch('future', '2026-07-18T06:00:00Z', 'Go for Launch')],
    previousRaw: [],
    now: NOW,
  });
  const gcat = outputs.launches.records.find(record => record.launch_id === 'gcat:2026-002');
  assert.equal(gcat.status, 'attempted');
  assert.equal(gcat.lifecycle, 'history');
  assert.equal(outputs.upcoming.pending_confirmation_count, 0);
});
