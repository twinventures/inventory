
// Optional: create a local seed copy in project root for inspection
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './src/db.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'inventory.sqlite');
const db = new Database(dbPath);
db.init();
console.log('Seeded:', dbPath);
