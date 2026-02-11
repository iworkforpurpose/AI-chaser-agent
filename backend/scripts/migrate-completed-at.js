require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dayjs = require('dayjs');
const { createClient } = require('@boltic/sdk');
const db = require('../db/bolticClient');

const scalar = (value) => (Array.isArray(value) ? value[0] : value);
const normalizeStatus = (value) => String(scalar(value) || '').toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ensureDatabaseContext(client) {
  const dbId = process.env.BOLTIC_DATABASE_ID;
  const dbInternalName = process.env.BOLTIC_DATABASE_INTERNAL_NAME;

  if (dbInternalName) {
    try {
      await client.useDatabase(dbInternalName);
      console.log(`🔗 Using database internal name: ${dbInternalName}`);
      return;
    } catch (err) {
      console.warn(`⚠️ useDatabase failed for internal name "${dbInternalName}" (${err.message}); falling back to db ID context`);
    }
  }

  if (!dbId) return;
  if (UUID_RE.test(dbId)) {
    client.currentDatabase = { databaseId: dbId };
    console.log(`🔗 Using database ID context: ${dbId}`);
    return;
  }

  try {
    await client.useDatabase(dbId);
    console.log(`🔗 Using database internal name: ${dbId}`);
  } catch (err) {
    console.warn(`⚠️ useDatabase failed (${err.message}); attempting direct context assignment`);
    client.currentDatabase = { databaseId: dbId };
  }
}

async function ensureCompletedAtColumn(client) {
  const columnsRes = await client.columns.findAll('tasks');
  if (columnsRes?.error) {
    throw new Error(columnsRes.error.message || 'Failed to fetch task columns');
  }

  const columns = Array.isArray(columnsRes?.data) ? columnsRes.data : [];
  const hasCompletedAt = columns.some((column) => column.name === 'completed_at');
  if (hasCompletedAt) {
    console.log('✅ Column already exists: tasks.completed_at');
    return;
  }

  const createRes = await client.columns.create('tasks', {
    name: 'completed_at',
    type: 'date-time',
    is_nullable: true,
    is_indexed: true,
    description: 'Timestamp when task first entered done state',
  });

  if (createRes?.error) {
    throw new Error(createRes.error.message || 'Failed to create completed_at column');
  }

  console.log('✅ Added column: tasks.completed_at');
}

function resolveBackfillTimestamp(task) {
  const candidates = [scalar(task.updated_at), scalar(task.created_at)];
  for (const candidate of candidates) {
    if (candidate && dayjs(candidate).isValid()) {
      return dayjs(candidate).toISOString();
    }
  }
  return new Date().toISOString();
}

async function backfillCompletedAt() {
  const stats = {
    scanned: 0,
    doneTasks: 0,
    backfilled: 0,
    skipped: 0,
    failed: 0,
  };

  const pageSize = 200;
  let offset = 0;

  while (true) {
    const batch = await db.find('tasks', { limit: pageSize, offset, sort: 'due_date' });
    if (!batch.length) break;

    stats.scanned += batch.length;
    offset += pageSize;

    for (const task of batch) {
      const status = normalizeStatus(task.status);
      if (status !== 'done') {
        stats.skipped += 1;
        continue;
      }

      stats.doneTasks += 1;
      const completedAt = scalar(task.completed_at);
      if (completedAt && dayjs(completedAt).isValid()) {
        stats.skipped += 1;
        continue;
      }

      try {
        await db.update('tasks', task.id, { completed_at: resolveBackfillTimestamp(task) });
        stats.backfilled += 1;
      } catch (err) {
        stats.failed += 1;
        console.error(`❌ Failed to backfill task ${task.id}:`, err.message);
      }
    }
  }

  return stats;
}

async function run() {
  console.log('\n🚀 Running completed_at migration...');
  const client = createClient(process.env.BOLTIC_API_KEY);

  await ensureDatabaseContext(client);
  await ensureCompletedAtColumn(client);
  const stats = await backfillCompletedAt();

  console.log('\n📊 Migration summary');
  console.table(stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
