const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables from the root .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const filePath = path.join(__dirname, '..', 'settings_response.json');
  console.log('Reading settings file from:', filePath);
  
  // Read file as raw buffer
  const buffer = fs.readFileSync(filePath);
  
  // UTF-16LE has BOM: FF FE
  let content = buffer.toString('utf16le');
  
  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  const parsed = JSON.parse(content);
  const settings = parsed.settings || [];
  console.log(`Loaded ${settings.length} settings from file.`);

  // Connect to database
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'v4',
    port: parseInt(process.env.DB_PORT || '3306', 10)
  });

  console.log('Connected to MySQL database.');

  try {
    for (const setting of settings) {
      const { key, value } = setting;
      // Insert or update setting
      await connection.execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );
    }
    console.log('Successfully seeded settings table!');
  } catch (error) {
    console.error('Error seeding settings:', error);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
