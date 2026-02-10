require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db/bolticClient');

(async () => {
  const users = await db.find('users', { limit: 200 });
  const tasks = await db.find('tasks', { limit: 200 });
  const rules = await db.find('chaser_rules', { limit: 200 });

  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    if (email === 'temp@test.com') {
      console.log('Deleting temp user', u.id, email);
      await db.delete('users', u.id);
    }
  }

  for (const t of tasks) {
    const email = (t.assignee_email || '').toLowerCase();
    if (email === 'temp@test.com') {
      console.log('Deleting temp task', t.id, t.title);
      await db.delete('tasks', t.id);
    }
  }

  const seen = new Set();
  for (const r of rules) {
    const name = r.name || '';
    if (seen.has(name)) {
      console.log('Deleting duplicate rule', r.id, name);
      await db.delete('chaser_rules', r.id);
    } else {
      seen.add(name);
    }
  }
})();
