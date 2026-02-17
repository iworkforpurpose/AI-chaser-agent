/**
 * Boltic DB Schema Initializer (SDK)
 * Run: node db/init.js
 * Creates required tables using @boltic/sdk
 */

require('dotenv').config();
const { createClient } = require('@boltic/sdk');

const client = createClient(process.env.BOLTIC_API_KEY);

const TABLES = [
  {
    name: 'users',
    description: 'People who can be assigned tasks and receive chasers',
    fields: [
      { name: 'email', type: 'email', is_nullable: false, is_unique: true, is_indexed: true },
      { name: 'name', type: 'text', is_nullable: false },
      { name: 'password_hash', type: 'text', is_nullable: true },
      { name: 'role', type: 'dropdown', selectable_items: ['user', 'manager', 'admin'], multiple_selections: false, is_nullable: false, default_value: 'user' },
      { name: 'timezone', type: 'text', is_nullable: true, default_value: 'UTC' },
      { name: 'active', type: 'checkbox', is_nullable: false, default_value: true },
    ],
  },
  {
    name: 'tasks',
    description: 'Work items that can be chased',
    fields: [
      { name: 'title', type: 'text', is_nullable: false },
      { name: 'description', type: 'long-text', is_nullable: true },
      { name: 'assignee_id', type: 'text', is_nullable: false, is_indexed: true },
      { name: 'assignee_email', type: 'email', is_nullable: false, is_indexed: true },
      { name: 'assignee_name', type: 'text', is_nullable: true },
      { name: 'status', type: 'dropdown', selectable_items: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'], multiple_selections: false, is_nullable: false, default_value: 'todo', is_indexed: true },
      { name: 'priority', type: 'dropdown', selectable_items: ['low', 'medium', 'high', 'critical'], multiple_selections: false, is_nullable: false, default_value: 'medium' },
      { name: 'due_date', type: 'date-time', is_nullable: false, is_indexed: true },
      { name: 'completed_at', type: 'date-time', is_nullable: true, is_indexed: true },
      { name: 'chaser_enabled', type: 'checkbox', is_nullable: false, default_value: true },
      { name: 'times_chased', type: 'number', is_nullable: false, default_value: 0 },
      { name: 'times_escalated', type: 'number', is_nullable: false, default_value: 0 },
      { name: 'last_chased_at', type: 'date-time', is_nullable: true, is_indexed: true },
      { name: 'snoozed_until', type: 'date-time', is_nullable: true },
      { name: 'ack_token', type: 'text', is_nullable: true },
    ],
  },
  {
    name: 'chaser_rules',
    description: 'Rules that drive chaser behavior',
    fields: [
      { name: 'name', type: 'text', is_nullable: false },
      { name: 'is_active', type: 'checkbox', is_nullable: false, default_value: true },
      { name: 'applies_to_priority', type: 'dropdown', selectable_items: ['all', 'critical', 'high', 'medium', 'low'], multiple_selections: false, is_nullable: false, default_value: 'all' },
      { name: 'chase_before_hours', type: 'number', is_nullable: false, default_value: 24 },
      { name: 'escalate_after_days', type: 'number', is_nullable: false, default_value: 3 },
      { name: 'max_chases', type: 'number', is_nullable: false, default_value: 3 },
      { name: 'escalation_channel', type: 'dropdown', selectable_items: ['email', 'slack', 'webhook'], multiple_selections: false, is_nullable: false, default_value: 'email' },
      { name: 'manual_button_enabled', type: 'checkbox', is_nullable: false, default_value: true },
      { name: 'message_template', type: 'long-text', is_nullable: true },
    ],
  },
  {
    name: 'chaser_logs',
    description: 'Audit of chasers sent per task',
    fields: [
      { name: 'task_id', type: 'text', is_nullable: false, is_indexed: true },
      { name: 'rule_id', type: 'text', is_nullable: true },
      { name: 'type', type: 'dropdown', selectable_items: ['deadline_proximity', 'overdue_escalation', 'manual', 'auto_ack'], multiple_selections: false, is_nullable: false },
      { name: 'status', type: 'dropdown', selectable_items: ['sent', 'failed', 'acknowledged'], multiple_selections: false, is_nullable: false, default_value: 'sent' },
      { name: 'channel', type: 'dropdown', selectable_items: ['email', 'slack', 'webhook'], multiple_selections: false, is_nullable: false, default_value: 'email' },
      { name: 'message_sent', type: 'long-text', is_nullable: true },
      { name: 'sent_at', type: 'date-time', is_nullable: true },
      { name: 'acknowledged_at', type: 'date-time', is_nullable: true },
      { name: 'error', type: 'long-text', is_nullable: true },
      { name: 'attempt', type: 'number', is_nullable: false, default_value: 1 },
    ],
  },
];

async function ensureDatabaseContext() {
  if (process.env.BOLTIC_DATABASE_ID) {
    try {
      await client.useDatabase(process.env.BOLTIC_DATABASE_ID);
      console.log(`🔗 Using database: ${process.env.BOLTIC_DATABASE_ID}`);
      return;
    } catch (err) {
      console.warn(`⚠️  useDatabase failed for ${process.env.BOLTIC_DATABASE_ID} (will pass db_id on calls): ${err.message}`);
    }
  }
  console.log('ℹ️  Using default Boltic database or explicit db_id per call');
}

async function ensureTable(table) {
  const existing = await client.tables.findByName(table.name);
  if (existing?.data) {
    console.log(`⚠️  Table already exists: ${table.name} (skipped)`);
    return;
  }

  const { error } = await client.tables.create({
    name: table.name,
    description: table.description,
    fields: table.fields,
    db_id: process.env.BOLTIC_DATABASE_ID,
  });

  if (error) {
    throw new Error(`Failed to create table ${table.name}: ${error.message || error}`);
  }

  console.log(`✅ Created table: ${table.name}`);
}

async function initTables() {
  console.log('🚀 Initializing Boltic Tables via SDK...\n');
  await ensureDatabaseContext();

  for (const table of TABLES) {
    try {
      await ensureTable(table);
    } catch (err) {
      console.error(`❌ Error creating table ${table.name}:`, err.message);
    }
  }

  console.log('\n✨ Table initialization complete!');
  console.log('👉 Run: npm run db:seed to add sample data');
}

initTables().catch((err) => {
  console.error('Fatal error during init:', err.message);
  process.exit(1);
});
