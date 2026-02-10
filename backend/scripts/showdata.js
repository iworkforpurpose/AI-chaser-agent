require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db/bolticClient');

(async () => {
  const users = await db.find('users', { limit: 50 });
  const rules = await db.find('chaser_rules', { limit: 50 });
  const tasks = await db.find('tasks', { limit: 50 });

  console.log('\nUsers:', users.length);
  console.table(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active })));

  console.log('\nChaser Rules:', rules.length);
  console.table(rules.map(r => ({ id: r.id, name: r.name, applies_to_priority: r.applies_to_priority, chase_before_hours: r.chase_before_hours, escalation_channel: r.escalation_channel, is_active: r.is_active })));

  console.log('\nTasks:', tasks.length);
  console.table(tasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, assignee_email: t.assignee_email, chaser_enabled: t.chaser_enabled })));
})();
