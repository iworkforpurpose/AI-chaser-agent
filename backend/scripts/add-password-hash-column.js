require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@boltic/sdk');

async function ensureDatabaseContext(client) {
  const dbId = process.env.BOLTIC_DATABASE_ID;
  if (!dbId) return;
  
  // Try assigning direct context
  client.currentDatabase = { databaseId: dbId };
  console.log(`🔗 Using database ID context: ${dbId}`);
}

async function ensurePasswordHashColumn(client) {
  console.log('🔍 Checking for password_hash column in users table...');
  const columnsRes = await client.columns.findAll('users');
  if (columnsRes?.error) {
    throw new Error(columnsRes.error.message || 'Failed to fetch user columns');
  }

  const columns = Array.isArray(columnsRes?.data) ? columnsRes.data : [];
  const hasColumn = columns.some((column) => column.name === 'password_hash');
  
  if (hasColumn) {
    console.log('✅ Column already exists: users.password_hash');
    return;
  }

  console.log('➕ Adding password_hash column to users table...');
  const createRes = await client.columns.create('users', {
    name: 'password_hash',
    type: 'text',
    is_nullable: true,
    description: 'Hashed user password for authentication',
  });

  if (createRes?.error) {
    throw new Error(createRes.error.message || 'Failed to create password_hash column');
  }

  console.log('✅ Added column: users.password_hash');
}

async function run() {
  const client = createClient(process.env.BOLTIC_API_KEY);
  await ensureDatabaseContext(client);
  await ensurePasswordHashColumn(client);
  console.log('\n✨ Migration complete!');
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
