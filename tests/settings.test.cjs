const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, normalizeSettings } = require('../electron/settings.cjs');

test('normalizes persisted numeric settings', () => {
  assert.deepEqual(normalizeSettings({ transferBudget: '65000', maxWeeklyWage: '1000', formation: ' 4-2-3-1 ' }), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ transferBudget: 0, maxWeeklyWage: 0, formation: '4-3-2-1' }), { transferBudget: 0, maxWeeklyWage: 0, formation: '4-3-2-1' });
});

test('rejects negative, non-finite, excessive and malformed settings', () => {
  assert.throws(() => normalizeSettings({ transferBudget: -1, maxWeeklyWage: 1, formation: '4-2-3-1' }), /Transferbudget/);
  assert.throws(() => normalizeSettings({ transferBudget: 'no', maxWeeklyWage: 1, formation: '4-2-3-1' }), /Transferbudget/);
  assert.throws(() => normalizeSettings({ transferBudget: '', maxWeeklyWage: 1, formation: '4-2-3-1' }), /Transferbudget/);
  assert.throws(() => normalizeSettings({ transferBudget: 1, maxWeeklyWage: Number.POSITIVE_INFINITY, formation: '4-2-3-1' }), /Wochengehalt/);
  assert.throws(() => normalizeSettings({ transferBudget: 1, maxWeeklyWage: 1, formation: '' }), /Formation/);
  assert.throws(() => normalizeSettings({ transferBudget: 1, maxWeeklyWage: 1, formation: 'x'.repeat(41) }), /Formation/);
});
