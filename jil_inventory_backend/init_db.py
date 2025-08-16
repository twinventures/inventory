import sqlite3

conn = sqlite3.connect("inventory.db")
cursor = conn.cursor()

# Create table
cursor.execute("""
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL
)
""")

# Insert sample data
cursor.executemany("""
INSERT INTO inventory (location_id, item_name, quantity)
VALUES (?, ?, ?)
""", [
    (1, 'Shovel', 10),
    (1, 'Helmet', 5),
    (2, 'Pickaxe', 7)
])

conn.commit()
conn.close()

print("Database initialized with sample data.")
