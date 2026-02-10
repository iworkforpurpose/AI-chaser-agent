/**
 * Seed file — populates Boltic DB with realistic demo data
 * Run: node src/db/seed.js
 */

require('dotenv').config();
const db = require('./bolticClient');
const dayjs = require('dayjs');

const now = dayjs();

const USERS = [
  { name: 'Arjun Sharma',   email: 'arjun@acme.com',  role: 'manager', active: true },
  { name: 'Priya Mehta',    email: 'priya@acme.com',  role: 'user',    active: true },
  { name: 'Rohan Das',      email: 'rohan@acme.com',  role: 'user',    active: true },
  { name: 'Sneha Iyer',     email: 'sneha@acme.com',  role: 'user',    active: true },
  { name: 'Vikram Nair',    email: 'vikram@acme.com', role: 'admin',   active: true },
];

const CHASER_RULES = [
  {
    name: 'Deadline - 24h',
    is_active: true,
    applies_to_priority: 'all',
    chase_before_hours: 24,
    escalate_after_days: 3,
    max_chases: 3,
    escalation_channel: 'email',
    manual_button_enabled: true,
    message_template: 'Hey {{assignee_name}}, "{{task_title}}" is due in {{hours_until_due}} hours. Need a hand?'
  },
  {
    name: 'Overdue Escalation',
    is_active: true,
    applies_to_priority: 'high',
    chase_before_hours: 2,
    escalate_after_days: 2,
    max_chases: 2,
    escalation_channel: 'email',
    manual_button_enabled: true,
    message_template: '⚠️ {{assignee_name}}, "{{task_title}}" is overdue by {{days_overdue}} days. Please update or escalate.'
  },
];

async function seedDatabase() {
  console.log('🌱 Seeding Boltic Database...\n');

  // Seed Users
  console.log('👤 Creating users...');
  const createdUsers = [];
  const userByEmail = {};
  for (const user of USERS) {
    try {
      const normalized = { ...user, email: user.email.toLowerCase() };
      const u = await db.insert('users', normalized);
      createdUsers.push(u);
      userByEmail[normalized.email] = u;
      console.log(`  ✅ ${normalized.name} (${normalized.email})`);
    } catch (e) {
      console.log(`  ⚠️  User ${user.email} may already exist`);
    }
  }

  // Backfill map from existing users to ensure refs work
  try {
    const existing = await db.find('users', { limit: 200 });
    for (const u of existing) {
      userByEmail[u.email?.toLowerCase?.() || u.email] = u;
    }
  } catch (_) {
    // ignore
  }

  // Seed Chaser Rules
  console.log('\n⚙️  Creating chaser rules...');
  for (const rule of CHASER_RULES) {
    try {
      await db.insert('chaser_rules', rule);
      console.log(`  ✅ ${rule.name}`);
    } catch (e) {
      console.log(`  ⚠️  Rule may already exist`);
    }
  }

  // Seed Tasks (minimal set for chaser flows)
  console.log('\n📋 Creating sample tasks...');
  const TASKS = [
    {
      title: 'Finalize API Documentation',
      description: 'Complete OpenAPI spec for all v2 endpoints',
      assignee_email: 'priya@acme.com',
      due_date: now.add(1, 'day').toISOString(),
      priority: 'high',
      status: 'in_progress',
      chaser_enabled: true,
    },
    {
      title: 'Set up CI/CD Pipeline',
      description: 'Configure GitHub Actions for automated deployments',
      assignee_email: 'rohan@acme.com',
      due_date: now.subtract(1, 'day').toISOString(),
      priority: 'critical',
      status: 'todo',
      chaser_enabled: true,
    },
    {
      title: 'User Research Report',
      description: 'Compile findings from 20 user interviews',
      assignee_email: 'sneha@acme.com',
      due_date: now.subtract(3, 'days').toISOString(),
      priority: 'high',
      status: 'blocked',
      chaser_enabled: true,
    },
  ];

  for (const task of TASKS) {
    try {
      const assignee = userByEmail[task.assignee_email.toLowerCase()];
      if (!assignee) {
        console.log(`  ⚠️  No user found for ${task.assignee_email}, skipping task ${task.title}`);
        continue;
      }

      const payload = {
        ...task,
        assignee_id: assignee.id,
        assignee_email: task.assignee_email.toLowerCase(),
        assignee_name: assignee.name,
        times_chased: 0,
        times_escalated: 0,
      };

      const t = await db.insert('tasks', payload);
      console.log(`  ✅ [${task.priority.toUpperCase()}] ${task.title} → ${task.status}`);
    } catch (e) {
      console.log(`  ⚠️  Task creation failed: ${e.message}`);
    }
  }

  console.log('\n🎉 Seeding complete! Your Boltic database is ready.');
  console.log('👉 Start the server: npm run dev');
}

seedDatabase().catch(console.error);
