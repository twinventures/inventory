
import DatabaseDriver from 'better-sqlite3';
import fs from 'fs';

export class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new DatabaseDriver(dbPath);
  }
  init() {
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS locations(id INTEGER PRIMARY KEY, name TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER);
      CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, sku TEXT UNIQUE, name TEXT, category_id INTEGER);
      CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY, item_id INTEGER, location_id INTEGER, qty INTEGER, cost_per_unit REAL);
    `);
    const row = this.db.prepare('SELECT COUNT(*) as c FROM locations').get();
    if (row.c === 0) {
      this.seed();
    }
  }
  seed() {
    const locations = ['Katampe', 'Niger', 'Ekiti'];
    const categories = [
      ['Equipment', null],
      ['Drills', 1],
      ['Excavators', 1],
      ['Safety', null],
      ['PPE', 4],
      ['First Aid', 4],
      ['Materials', null],
      ['Explosives', 7],
      ['Fuel', 7],
      ['Lubricants', 7],
      ['Spares', null],
      ['Filters', 11],
      ['Belts', 11]
    ];
    const tx = this.db.transaction(() => {
      for (const name of locations) {
        this.db.prepare('INSERT INTO locations(name) VALUES (?)').run(name);
      }
      for (const [name, parent] of categories) {
        this.db.prepare('INSERT INTO categories(name, parent_id) VALUES (?, ?)').run(name, parent);
      }
      const catIds = this.db.prepare('SELECT id, name FROM categories').all();
      const rand = (arr) => arr[Math.floor(Math.random()*arr.length)];
      for (let i=1;i<=150;i++) {
        const cat = rand(catIds);
        const sku = `SKU-${String(i).padStart(4,'0')}`;
        const name = `Item ${i} (${cat.name})`;
        this.db.prepare('INSERT INTO items(sku,name,category_id) VALUES (?,?,?)').run(sku, name, cat.id);
      }
      const itemIds = this.db.prepare('SELECT id FROM items').all();
      const locIds = this.db.prepare('SELECT id FROM locations').all();
      for (const item of itemIds) {
        for (const loc of locIds) {
          const qty = Math.floor(Math.random()*100);
          const cpu = (Math.random()*900 + 100).toFixed(2);
          this.db.prepare('INSERT INTO inventory(item_id, location_id, qty, cost_per_unit) VALUES (?,?,?,?)')
            .run(item.id, loc.id, qty, cpu);
        }
      }
    });
    tx();
  }
  listInventory(locationId) {
    const sql = `
      SELECT inv.id, it.sku, it.name as item, c.name as category, l.name as location, inv.qty, inv.cost_per_unit,
             (inv.qty*inv.cost_per_unit) as value
      FROM inventory inv
      JOIN items it ON it.id = inv.item_id
      JOIN categories c ON c.id = it.category_id
      JOIN locations l ON l.id = inv.location_id
      WHERE (? IS NULL OR l.id = ?)
      ORDER BY it.sku
      LIMIT 500;
    `;
    return this.db.prepare(sql).all(locationId ?? null, locationId ?? null);
  }
  summary() {
    const totalsByLocation = this.db.prepare(`
      SELECT l.name as location, SUM(inv.qty) as total_qty, ROUND(SUM(inv.qty*inv.cost_per_unit),2) as total_value
      FROM inventory inv JOIN locations l ON l.id = inv.location_id
      GROUP BY l.id ORDER BY l.name;
    `).all();
    const lowStock = this.db.prepare(`
      SELECT it.sku, it.name, l.name as location, inv.qty
      FROM inventory inv JOIN items it ON it.id=inv.item_id JOIN locations l ON l.id=inv.location_id
      WHERE inv.qty < 10
      ORDER BY inv.qty ASC LIMIT 25;
    `).all();
    const topItems = this.db.prepare(`
      SELECT it.sku, it.name, ROUND(SUM(inv.qty*inv.cost_per_unit),2) as value
      FROM inventory inv JOIN items it ON it.id=inv.item_id
      GROUP BY it.id ORDER BY value DESC LIMIT 10;
    `).all();
    return { totalsByLocation, lowStock, topItems };
  }
  filters() {
    const locations = this.db.prepare('SELECT id, name FROM locations ORDER BY name').all();
    return { locations };
  }
  countItems() {
  const row = this.db.prepare('SELECT COUNT(*) as c FROM items').get();
  return row.c;
  }
}
