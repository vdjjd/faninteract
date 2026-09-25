import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGuestExportRows } from '../lib/guestExport.ts';

function database({ guests = [], profiles = [], leads = [], failure } = {}) {
  const query = (source, rows) => ({
    select(columns) { assert.equal(columns, '*'); return this; },
    eq(column, value) {
      assert.equal(column, 'host_id');
      assert.equal(value, 'host-1');
      return this;
    },
    order() { return this; },
    range(start, end) {
      return Promise.resolve({
        data: rows.slice(start, end + 1),
        error: failure === source ? { message: 'Database unavailable' } : null,
      });
    },
  });
  return {
    rpc(name, args) {
      assert.equal(name, 'export_host_guests');
      assert.deepEqual(args, { p_host_id: 'host-1' });
      return query('guests', guests);
    },
    from(name) {
      assert.ok(['guest_profiles', 'priority_leads'].includes(name));
      return query(name, name === 'guest_profiles' ? profiles : leads);
    },
  };
}

test('exports saved profiles even when the event function returns no guests', async () => {
  const rows = await loadGuestExportRows(database({ profiles: [{
    id: 'p1', device_id: 'd1', first_name: 'Alex', email: 'alex@example.com',
    age: 30, date_of_birth: '1996-01-02', created_at: '2026-09-25T12:30:00Z',
  }] }), 'host-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].first_name, 'Alex');
  assert.equal(rows[0].age, 30);
  assert.equal(rows[0].date_of_birth, '1996-01-02');
  assert.ok(rows[0].profile_created_date);
  assert.equal(rows[0].joined_date, '');
});

test('preserves multiple event rows and enriches without adding duplicate profiles', async () => {
  const rows = await loadGuestExportRows(database({
    guests: [{ device_id: 'd1', event_id: 'e1' }, { device_id: 'd1', event_id: 'e2' }],
    profiles: [{ device_id: 'd1', first_name: 'Alex', age: 30 }],
  }), 'host-1');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.event_id), ['e1', 'e2']);
  assert.ok(rows.every(r => r.age === 30 && r.first_name === 'Alex'));
});

test('handles leads with either optional column convention', async () => {
  const rows = await loadGuestExportRows(database({ leads: [
    { zip: '12345', source: 'qr', wants_contact: false },
    { zip_code: '67890', source_type: 'ad', wants_contact: true },
  ] }), 'host-1');
  assert.deepEqual(rows.map(r => [r.zip, r.source, r.wants_contact]), [
    ['12345', 'qr', 'no'], ['67890', 'ad', 'yes'],
  ]);
});

test('exports beyond a single API page', async () => {
  const profiles = Array.from({ length: 1001 }, (_, i) => ({ id: `p${i}`, first_name: `Guest ${i}` }));
  const rows = await loadGuestExportRows(database({ profiles }), 'host-1');
  assert.equal(rows.length, 1001);
  assert.equal(rows[1000].first_name, 'Guest 1000');
});

test('database failures do not silently produce an incomplete export', async () => {
  await assert.rejects(loadGuestExportRows(database({ failure: 'guest_profiles' }), 'host-1'), /Guest profiles: Database unavailable/);
});
