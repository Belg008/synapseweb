"""
SynapseWeb API Server
Backend for delt AI-minne med REST API og WebSocket
"""

import asyncio
import json
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List

DB_PATH = Path(__file__).parent / "synapseweb.db"

# === DATABASE ===
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            category TEXT DEFAULT 'kunnskap',
            content TEXT,
            tags TEXT,
            agent_id TEXT DEFAULT 'unknown',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_node INTEGER NOT NULL,
            to_node INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_node) REFERENCES nodes(id),
            FOREIGN KEY (to_node) REFERENCES nodes(id)
        )
    """)
    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# === PYDANTIC MODELLER ===
class NodeCreate(BaseModel):
    label: str
    category: str = "kunnskap"
    content: Optional[str] = ""
    tags: Optional[str] = ""
    parent_id: Optional[int] = None
    agent_id: Optional[str] = "unknown"

class NodeUpdate(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None

class NodeResponse(BaseModel):
    id: int
    label: str
    category: str
    content: Optional[str]
    tags: Optional[str]
    agent_id: str
    created_at: str

# === FASTAPI ===
app = FastAPI(title="SynapseWeb API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections
websocket_connections: List[WebSocket] = []

async def broadcast(message: dict):
    disconnected = []
    for ws in websocket_connections:
        try:
            await ws.send_json(message)
        except:
            disconnected.append(ws)
    for ws in disconnected:
        websocket_connections.remove(ws)

@app.on_event("startup")
async def startup():
    init_db()

# === REST API ===

@app.get("/")
async def root():
    return FileResponse(Path(__file__).parent / "index.html")

@app.get("/api/nodes")
async def get_nodes(category: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    if category:
        cursor.execute("SELECT * FROM nodes WHERE category = ? ORDER BY created_at DESC", (category,))
    else:
        cursor.execute("SELECT * FROM nodes ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/nodes/{node_id}")
async def get_node(node_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return {"error": "Node not found"}, 404
    return dict(row)

@app.post("/api/nodes")
async def create_node(node: NodeCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO nodes (label, category, content, tags, agent_id)
        VALUES (?, ?, ?, ?, ?)
    """, (node.label, node.category, node.content, node.tags, node.agent_id))
    node_id = cursor.lastrowid

    if node.parent_id:
        cursor.execute("INSERT INTO edges (from_node, to_node) VALUES (?, ?)",
                      (node.parent_id, node_id))

    conn.commit()
    conn.close()

    result = {"type": "node_created", "data": {"id": node_id, **node.dict()}}
    await broadcast(result)
    return result

@app.put("/api/nodes/{node_id}")
async def update_node(node_id: int, node: NodeUpdate):
    conn = get_db()
    cursor = conn.cursor()

    updates = []
    values = []
    for field, value in node.dict(exclude_unset=True).items():
        updates.append(f"{field} = ?")
        values.append(value)

    if updates:
        values.append(node_id)
        cursor.execute(f"UPDATE nodes SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
        conn.commit()

    cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
    row = cursor.fetchone()
    conn.close()

    result = {"type": "node_updated", "data": dict(row)}
    await broadcast(result)
    return result

@app.delete("/api/nodes/{node_id}")
async def delete_node(node_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM edges WHERE from_node = ? OR to_node = ?", (node_id, node_id))
    cursor.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
    conn.commit()
    conn.close()

    result = {"type": "node_deleted", "data": {"id": node_id}}
    await broadcast(result)
    return result

@app.get("/api/edges")
async def get_edges():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM edges")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/search")
async def search_nodes(q: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM nodes
        WHERE label LIKE ? OR content LIKE ? OR tags LIKE ?
        ORDER BY created_at DESC
    """, (f"%{q}%", f"%{q}%", f"%{q}%"))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/stats")
async def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM nodes")
    total = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) as total FROM edges")
    edges = cursor.fetchone()["total"]
    cursor.execute("SELECT category, COUNT(*) as count FROM nodes GROUP BY category")
    categories = {row["category"]: row["count"] for row in cursor.fetchall()}
    cursor.execute("SELECT COUNT(DISTINCT agent_id) as count FROM nodes")
    agents = cursor.fetchone()["count"]
    conn.close()
    return {"total_nodes": total, "total_edges": edges, "categories": categories, "agents": agents}

# === WEBSOCKET ===
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_connections.append(websocket)

    # Send initial data
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nodes")
    nodes = [dict(row) for row in cursor.fetchall()]
    cursor.execute("SELECT * FROM edges")
    edges = [dict(row) for row in cursor.fetchall()]
    conn.close()

    await websocket.send_json({
        "type": "init",
        "data": {"nodes": nodes, "edges": edges}
    })

    try:
        while True:
            data = await websocket.receive_json()
            # Handle incoming messages if needed
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)

# === SERV STATISKE FILER ===
@app.get("/{path:path}")
async def serve_static(path: str):
    file_path = Path(__file__).parent / path
    if file_path.exists():
        return FileResponse(file_path)
    return FileResponse(Path(__file__).parent / "index.html")

if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run(app, host="0.0.0.0", port=8765)
