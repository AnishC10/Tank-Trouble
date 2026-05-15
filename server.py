"""
Tank Trouble — FastAPI WebSocket Server
CS181 Final Project — Technical Component G: Multiplayer via FastAPI

Architecture
------------
This is a broadcast server: every message received from any client is
forwarded to all *other* connected clients. Game logic stays entirely in
the browser; the server is a thin message bus.

Endpoints
---------
GET  /        → serves index.html (the game)
GET  /css/*   → serves CSS files
GET  /js/*    → serves JS files
WS   /ws      → WebSocket relay for game messages

Protocol (JSON messages, defined in index.html)
---------
  {t: 'hello', role: 'p1'|'p2'}    — client announces its role
  {t: 'inp',   inp: {...}}           — P2 sends keyboard input to host
  {t: 'state', ...}                  — host sends authoritative game state
  {t: 'start', seed, scores}         — host signals game start
  {t: 'newround', seed, scores}      — host signals new round
  {t: 'ping', ts} / {t: 'pong', ts} — latency measurement

Running locally
---------------
    pip install fastapi uvicorn
    python server.py
    # Open http://localhost:8081

Running with ngrok (cross-internet multiplayer)
-----------------------------------------------
    # Terminal 1:
    python server.py

    # Terminal 2:
    ngrok http 8081

    # Share the https://xxxx.ngrok-free.app URL with your friend.
    # Both players open that URL — the game auto-detects wss:// from https://.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
import logging
import os

# Resolve all paths relative to this file so the server works no matter
# which directory you launch it from (e.g. `python tank-trouble/server.py`)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Logging setup ───────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Tank Trouble Server")

# ── CORS — allow any origin so ngrok URLs work without issues ───────────────
# ngrok proxies requests from https://xxxx.ngrok-free.app, so we must allow
# cross-origin requests. In production you'd whitelist specific origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files — serve css/ and js/ directories ───────────────────────────
# This is what was missing: without these mounts, the browser's requests for
# css/style.css and js/*.js all returned 404, leaving the page unstyled.
app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "css")), name="css")
app.mount("/js",  StaticFiles(directory=os.path.join(BASE_DIR, "js")),  name="js")

# ── Connection manager ───────────────────────────────────────────────────────

class ConnectionManager:
    """
    Manages the set of active WebSocket connections.

    Responsibilities:
    • Track connected clients in a set.
    • Broadcast every incoming message to all *other* clients
      (so the sender does not echo its own message).
    • Clean up on disconnect.
    """

    def __init__(self):
        # Set of currently connected WebSocket objects
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        """Accept and register a new WebSocket client."""
        await ws.accept()
        self.active.add(ws)
        logger.info(f"Client connected — total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        """Remove a client that has disconnected."""
        self.active.discard(ws)
        logger.info(f"Client disconnected — total: {len(self.active)}")

    async def broadcast(self, message: str, sender: WebSocket):
        """
        Send a raw JSON string to every connected client except the sender.

        If a send fails (e.g. the client dropped mid-broadcast), the faulty
        connection is removed silently so it doesn't block future broadcasts.
        """
        dead: set[WebSocket] = set()
        for client in self.active:
            if client is sender:
                continue  # don't echo back to the sender
            try:
                await client.send_text(message)
            except Exception:
                dead.add(client)

        # Clean up any clients that errored during broadcast
        for client in dead:
            self.active.discard(client)


manager = ConnectionManager()


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def serve_game(request: Request):
    """
    Serve the game's HTML file at the root URL.

    Adds the 'ngrok-skip-browser-warning' header so that ngrok's interstitial
    warning page is bypassed — players see the game directly.
    """
    response = FileResponse(os.path.join(BASE_DIR, "index.html"), media_type="text/html")
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    WebSocket relay endpoint.

    Each connected client sends JSON messages; this endpoint broadcasts
    each message to all other connected clients. The server never
    inspects or modifies message content — it is a pure relay.
    """
    await manager.connect(ws)
    try:
        while True:
            # Wait for the next message from this client
            raw = await ws.receive_text()

            # Log the message type for debugging (not the full payload)
            try:
                msg_type = json.loads(raw).get("t", "?")
                logger.debug(f"Relay [{msg_type}] → {len(manager.active) - 1} peer(s)")
            except json.JSONDecodeError:
                logger.warning("Received non-JSON message, relaying anyway")

            # Broadcast to all other clients
            await manager.broadcast(raw, sender=ws)

    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
        manager.disconnect(ws)


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Serving game from: {BASE_DIR}")
    logger.info("Starting Tank Trouble server on http://localhost:8081")
    uvicorn.run(app, host="0.0.0.0", port=8081, log_level="info")