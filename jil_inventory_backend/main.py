import os
from datetime import datetime
from typing import Optional
from sqlalchemy import text

from sqlite3 import Connection, Row
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import SQLModel, Field, Session, select, create_engine
from passlib.hash import bcrypt
from dotenv import load_dotenv

load_dotenv()
DB_PATH = os.getenv("DB_PATH", "/var/tmp/inventory.sqlite")
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DB_PATH}"
SECRET_KEY = os.getenv("SECRET_KEY", "dev")

engine_args = {"pool_pre_ping": True}
if DATABASE_URL and DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_args)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# --------- MODELS ----------
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    role: str = Field(default="admin")
    active: bool = Field(default=True)

class Location(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)

class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    parent_id: Optional[int] = Field(default=None, foreign_key="category.id")

class Item(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sku: str = Field(index=True, unique=True)
    name: str = Field(index=True)
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    unit: str = Field(default="ea")

class Inventory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.id")
    location_id: int = Field(foreign_key="location.id")
    qty: int = Field(default=0)
    cost_per_unit: float = Field(default=0)

class Movement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.id")
    from_location_id: Optional[int] = Field(default=None, foreign_key="location.id")
    to_location_id: Optional[int] = Field(default=None, foreign_key="location.id")
    qty: int
    reason: str = Field(default="move")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")

# --------- DB INIT ----------
def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        if not s.exec(select(User).limit(1)).first():
            s.add(User(email="admin@jil.local", password_hash=bcrypt.hash("Admin123!"), role="admin", active=True))
        if not s.exec(select(Location).limit(1)).first():
            s.add_all([Location(name="Katampe"), Location(name="Niger"), Location(name="Ekiti")])
        if not s.exec(select(Category).limit(1)).first():
            s.add_all([
                Category(name="Equipment"),
                Category(name="Safety"),
                Category(name="Drills", parent_id=1),
                Category(name="PPE", parent_id=2),
            ])
        if not s.exec(select(Item).limit(1)).first():
            s.add_all([
                Item(sku="JIL-0001", name="Safety Helmet", category_id=4, unit="ea"),
                Item(sku="JIL-0002", name="Rock Drill", category_id=3, unit="ea"),
                Item(sku="JIL-0003", name="Diesel 50L", unit="L"),
            ])
        s.commit()

@app.on_event("startup")
def on_startup():
    init_db()

# --------- AUTH (simple for demo) ----------
def verify_user(email: str, password: str) -> User:
    with Session(engine) as s:
        user = s.exec(select(User).where(User.email == email, User.active == True)).first()
        if not user or not bcrypt.verify(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return user

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = verify_user(form.username, form.password)
    token = f"demo-{user.id}"
    return {"access_token": token, "token_type": "bearer", "role": user.role, "email": user.email}

# --------- BASIC ENDPOINTS ----------
@app.get("/health")
def health():
    return {"ok": True}

@app.get("/locations")
def get_locations():
    with Session(engine) as s:
        return s.exec(select(Location).order_by(Location.name)).all()

@app.get("/categories")
def get_categories():
    with Session(engine) as s:
        return s.exec(select(Category)).all()

@app.get("/items")
def get_items():
    with Session(engine) as s:
        return s.exec(select(Item).order_by(Item.sku)).all()

@app.get("/inventory")
def inventory(locationId: Optional[int] = None):
    sql = """
      SELECT inv.id,
             it.sku,
             it.name AS item,
             c.name  AS category,
             l.name  AS location,
             inv.qty,
             inv.cost_per_unit,
             (inv.qty * inv.cost_per_unit) AS value
      FROM inventory inv
      JOIN item it      ON it.id = inv.item_id
      LEFT JOIN category c ON c.id = it.category_id
      JOIN location l   ON l.id = inv.location_id
      WHERE (:locationId IS NULL OR l.id = :locationId)
      ORDER BY it.sku
      LIMIT 500
    """
    with Session(engine) as s:
        rows = s.exec(text(sql), {"locationId": locationId}).mappings().all()
        return [dict(r) for r in rows]

@app.get("/filters")
def filters():
    with Session(engine) as s:
        rows = s.exec(text("SELECT id, name FROM location ORDER BY name")).mappings().all()
        return {"locations": [dict(r) for r in rows]}


@app.post("/movements")
def move_item(m: Movement):
    with Session(engine) as s:
        # receive / issue / move
        if m.to_location_id:
            rec = s.exec(select(Inventory)
                         .where(Inventory.item_id==m.item_id, Inventory.location_id==m.to_location_id)).first()
            if not rec: rec = Inventory(item_id=m.item_id, location_id=m.to_location_id, qty=0, cost_per_unit=0)
            rec.qty += m.qty
            s.add(rec)
        if m.from_location_id:
            src = s.exec(select(Inventory)
                         .where(Inventory.item_id==m.item_id, Inventory.location_id==m.from_location_id)).first()
            if not src: raise HTTPException(400, "No stock at source")
            if src.qty < m.qty: raise HTTPException(400, "Insufficient stock")
            src.qty -= m.qty
            s.add(src)
        s.add(m)
        s.commit()
        return {"ok": True}

@app.get("/summary")
def summary():
    with Session(engine) as s:
        totals = s.exec(
            text("""
                SELECT l.name as location, SUM(inv.qty) as total_qty,
                       ROUND(SUM(inv.qty*inv.cost_per_unit)::numeric, 2) as total_value
                FROM inventory inv 
                JOIN location l ON l.id = inv.location_id
                GROUP BY l.name 
                ORDER BY l.name
            """)
        ).mappings().all()

        low = s.exec(
            text("""
                SELECT it.sku, it.name, l.name as location, inv.qty
                FROM inventory inv 
                JOIN item it ON it.id = inv.item_id 
                JOIN location l ON l.id = inv.location_id
                WHERE inv.qty < 10 
                ORDER BY inv.qty ASC 
                LIMIT 25
            """)
        ).mappings().all()

        top = s.exec(
            text("""
                SELECT it.sku, it.name, ROUND(SUM(inv.qty*inv.cost_per_unit)::numeric, 2) as value
                FROM inventory inv 
                JOIN item it ON it.id = inv.item_id
                GROUP BY it.sku, it.name 
                ORDER BY value DESC 
                LIMIT 10
            """)
        ).mappings().all()

        return {
            "totalsByLocation": [dict(x) for x in totals],
            "lowStock": [dict(x) for x in low],
            "topItems": [dict(x) for x in top]
        }


@app.get("/reports/summary")
def summary():
    with Session(engine) as s:
        with Session(engine) as s:
            totals = s.exec(
                text("""
                    SELECT l.name as location, SUM(inv.qty) as total_qty,
                        ROUND(SUM(inv.qty*inv.cost_per_unit)::numeric, 2) as total_value
                    FROM inventory inv 
                    JOIN location l ON l.id = inv.location_id
                    GROUP BY l.name 
                    ORDER BY l.name
                """)
            ).mappings().all()

        low = s.exec(
            text("""
                SELECT it.sku, it.name, l.name as location, inv.qty
                FROM inventory inv 
                JOIN item it ON it.id = inv.item_id 
                JOIN location l ON l.id = inv.location_id
                WHERE inv.qty < 10 
                ORDER BY inv.qty ASC 
                LIMIT 25
            """)
        ).mappings().all()

        top = s.exec(
            text("""
                SELECT it.sku, it.name, ROUND(SUM(inv.qty*inv.cost_per_unit)::numeric, 2) as value
                FROM inventory inv 
                JOIN item it ON it.id = inv.item_id
                GROUP BY it.sku, it.name 
                ORDER BY value DESC 
                LIMIT 10
            """)
        ).mappings().all()

        return {"totals":[dict(x) for x in totals],
                "low":[dict(x) for x in low],
                "top":[dict(x) for x in top]}
    
 
@app.get("/item_count")
def item_count():
    with Session(engine) as s:
        row = s.exec(text("SELECT COUNT(*) AS count FROM item")).mappings().one()
        return {"count": row["count"]}
