const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'v4',
    port: 3306
  });

  console.log('Connected to MySQL database.');

  try {
    // 1. Patch notification table
    const [columns] = await connection.query("SHOW COLUMNS FROM `notification` LIKE 'idempotency_key'");
    if (columns.length === 0) {
      console.log('Column idempotency_key does not exist, adding it...');
      await connection.query("ALTER TABLE `notification` ADD COLUMN `idempotency_key` VARCHAR(255) NULL");
      console.log('Column idempotency_key added successfully.');
    } else {
      console.log('Column idempotency_key already exists.');
    }

    const [indexes] = await connection.query("SHOW INDEX FROM `notification` WHERE Key_name = 'idempotency_key_index'");
    if (indexes.length === 0) {
      console.log('Index idempotency_key_index does not exist, adding it...');
      await connection.query("ALTER TABLE `notification` ADD INDEX `idempotency_key_index` (`idempotency_key`)");
      console.log('Index idempotency_key_index added successfully.');
    } else {
      console.log('Index idempotency_key_index already exists.');
    }

    // 2. Drop tags_idx from support_ticket
    const [supportIndexes] = await connection.query(
      "SHOW INDEX FROM `support_ticket` WHERE Key_name = 'tags_idx'"
    );
    if (supportIndexes.length > 0) {
      console.log('Index tags_idx exists on support_ticket, dropping it...');
      await connection.query("ALTER TABLE `support_ticket` DROP INDEX `tags_idx`");
      console.log('Index tags_idx dropped successfully.');
    } else {
      console.log('Index tags_idx does not exist on support_ticket.');
    }

  } catch (error) {
    console.error('Error patching database:', error);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
