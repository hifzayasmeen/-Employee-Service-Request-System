import test from 'node:test';
import assert from 'node:assert';
import { dueAt, validateRequest } from './sla.js';

test('SLA due times follow priority', () => {
  const t = new Date('2026-01-01T00:00:00Z');
  assert.equal(dueAt('High', t).toISOString(), '2026-01-01T04:00:00.000Z');
  assert.equal(dueAt('Medium', t).toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(dueAt('Low', t).toISOString(), '2026-01-04T00:00:00.000Z');
});
test('valid request passes', () => {
  assert.deepEqual(validateRequest({ title: 'Laptop broken', description: 'Screen flickers a lot', category: 'IT', priority: 'High' }), []);
});
test('invalid input is rejected', () => {
  assert.equal(validateRequest({ title: 'x', description: 'short', category: 'Legal', priority: 'Urgent' }).length, 4);
});
