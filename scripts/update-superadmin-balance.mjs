import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });
const require = createRequire(import.meta.url);

async function run() {
  const mysql = require(path.join(__dirname, '../backend/node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  console.log('Connected to MySQL server.');

  const [dbs] = await connection.execute('SHOW DATABASES');
  console.log('Databases available:', dbs.map(d => d.Database));

  // Use database v4
  const targetDb = 'v4';

  if (!targetDb) {
    console.log('No user database found.');
    await connection.end();
    return;
  }

  console.log(`Using database: ${targetDb}`);
  await connection.changeUser({ database: targetDb });

  const [users] = await connection.execute(
    `SELECT id, email, roleId FROM user WHERE email = 'superadmin@example.com' OR roleId = 52 OR roleId = '52' LIMIT 10`
  );

  console.log('Users found:', users);

  for (const user of users) {
    console.log(`Updating user ${user.email} (ID: ${user.id})...`);
    const [wallets] = await connection.execute(
      `SELECT id, currency, type, balance FROM wallet WHERE userId = ?`,
      [user.id]
    );

    console.log(`User ${user.email} wallets:`, wallets);

    if (wallets.length === 0) {
      const walletId = String(Date.now()) + Math.random().toString(36).substring(2, 8);
      await connection.execute(
        `INSERT INTO wallet (id, userId, currency, type, balance, inOrder, addresses, createdAt, updatedAt) 
         VALUES (?, ?, 'USDT', 'SPOT', 50000.00, 0, '{}', NOW(), NOW())`,
        [walletId, user.id]
      );
      console.log(`Created USDT wallet with 50,000 USDT balance for ${user.email}.`);
    } else {
      await connection.execute(
        `UPDATE wallet SET balance = 50000.00 WHERE userId = ?`,
        [user.id]
      );
      console.log(`Updated all wallets to 50,000 USDT for ${user.email}.`);
    }
  }

  await connection.end();
  console.log('Finished updating superadmin balance.');
}

run().catch((err) => {
  console.error('Error executing script:', err);
  process.exit(1);
});
