#!/usr/bin/env python3
"""
Tank Trouble — one-command launcher
====================================
Starts the FastAPI game server AND ngrok tunnel, then prints the public
URL your friend needs to open.  Kill with Ctrl+C to stop everything.

Usage
-----
    python launch.py

Requirements
------------
    pip install fastapi uvicorn requests
    # Install ngrok from https://ngrok.com/download, then:
    # ngrok config add-authtoken <YOUR_TOKEN>
    # (free account at https://dashboard.ngrok.com)
"""

import subprocess
import sys
import time
import signal
import os
import threading

# ── Colours for terminal output ──────────────────────────────────────────────
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

SERVER_PORT = 8081
NGROK_API   = "http://localhost:4040/api/tunnels"  # ngrok local API

processes = []  # track child processes for clean shutdown


def print_banner():
    print(f"""
{CYAN}{BOLD}
  ████████╗ █████╗ ███╗   ██╗██╗  ██╗    ████████╗██████╗  ██████╗ ██╗   ██╗██████╗ ██╗     ███████╗
     ██╔══╝██╔══██╗████╗  ██║██║ ██╔╝       ██╔══╝██╔══██╗██╔═══██╗██║   ██║██╔══██╗██║     ██╔════╝
     ██║   ███████║██╔██╗ ██║█████╔╝        ██║   ██████╔╝██║   ██║██║   ██║██████╔╝██║     █████╗  
     ██║   ██╔══██║██║╚██╗██║██╔═██╗        ██║   ██╔══██╗██║   ██║██║   ██║██╔══██╗██║     ██╔══╝  
     ██║   ██║  ██║██║ ╚████║██║  ██╗       ██║   ██║  ██║╚██████╔╝╚██████╔╝██████╔╝███████╗███████╗
     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝      ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
{RESET}""")


def check_requirements():
    """Verify ngrok and Python packages are available."""
    errors = []

    # Check ngrok
    result = subprocess.run(["ngrok", "version"], capture_output=True)
    if result.returncode != 0:
        errors.append(
            f"{RED}ngrok not found.{RESET}\n"
            "  → Download from https://ngrok.com/download\n"
            "  → Then run:  ngrok config add-authtoken <YOUR_TOKEN>\n"
            "  → (Free account at https://dashboard.ngrok.com)"
        )

    # Check FastAPI / uvicorn
    try:
        import fastapi, uvicorn
    except ImportError as e:
        errors.append(f"{RED}Missing Python package:{RESET} {e}\n  → Run: pip install fastapi uvicorn requests")

    # Check requests (used to poll ngrok API)
    try:
        import requests
    except ImportError:
        errors.append(f"{RED}Missing Python package: requests{RESET}\n  → Run: pip install requests")

    if errors:
        print(f"\n{YELLOW}── Setup required ──────────────────────────────{RESET}")
        for err in errors:
            print(f"\n{err}")
        print()
        sys.exit(1)


def start_server():
    """Start the FastAPI server as a subprocess."""
    print(f"{CYAN}[1/3]{RESET} Starting game server on port {SERVER_PORT}…")
    proc = subprocess.Popen(
        [sys.executable, "server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    processes.append(proc)

    # Stream server logs in a background thread so they don't block us
    def stream_logs():
        for line in proc.stdout:
            print(f"  {CYAN}server{RESET} │ {line}", end="")
    threading.Thread(target=stream_logs, daemon=True).start()

    # Give it a moment to bind
    time.sleep(1.5)
    if proc.poll() is not None:
        print(f"{RED}✗ Server failed to start. Check server.py for errors.{RESET}")
        sys.exit(1)
    print(f"  {GREEN}✓ Server running{RESET}")


def start_ngrok():
    """Start ngrok tunnel and return the public HTTPS URL."""
    print(f"{CYAN}[2/3]{RESET} Starting ngrok tunnel…")
    proc = subprocess.Popen(
        ["ngrok", "http", str(SERVER_PORT), "--log=stdout"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    processes.append(proc)

    # Poll ngrok's local API until the tunnel URL appears (up to 10 s)
    import requests as req
    public_url = None
    for attempt in range(20):
        time.sleep(0.5)
        try:
            data = req.get(NGROK_API, timeout=2).json()
            for tunnel in data.get("tunnels", []):
                if tunnel.get("proto") == "https":
                    public_url = tunnel["public_url"]
                    break
        except Exception:
            pass  # ngrok not ready yet — keep polling
        if public_url:
            break

    if not public_url:
        print(f"{RED}✗ Could not get ngrok URL. Is your authtoken configured?{RESET}")
        print(f"  Run:  {YELLOW}ngrok config add-authtoken <YOUR_TOKEN>{RESET}")
        print(f"  Get a free token at: https://dashboard.ngrok.com")
        cleanup()
        sys.exit(1)

    print(f"  {GREEN}✓ Tunnel active{RESET}")
    return public_url


def print_share_info(public_url: str):
    """Print the URL box that the user shares with their friend."""
    ws_url = public_url.replace("https://", "wss://") + "/ws"
    print(f"""
{GREEN}{BOLD}── [3/3] Ready! Share this URL ─────────────────────────────────{RESET}

  {BOLD}{YELLOW}  {public_url}  {RESET}

  Both players open that link in their browser.
  The first one to click {BOLD}Play Online{RESET} becomes Player 1 (host).
  The second becomes Player 2 and the game starts automatically.

  WebSocket endpoint (auto-detected by the game):
    {CYAN}{ws_url}{RESET}

{GREEN}── Controls ─────────────────────────────────────────────────────{RESET}
  Player 1 (host):   ESDF to move · Q to fire
  Player 2 (joiner): Arrow keys   · M to fire

{YELLOW}  Press Ctrl+C to stop the server and close the tunnel.{RESET}
{GREEN}─────────────────────────────────────────────────────────────────{RESET}
""")


def cleanup(*_):
    """Terminate all child processes on exit."""
    print(f"\n{YELLOW}Shutting down…{RESET}")
    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    # Register Ctrl+C handler
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print_banner()
    check_requirements()
    start_server()
    public_url = start_ngrok()
    print_share_info(public_url)

    # Keep alive — the server and ngrok run as subprocesses
    print("Waiting (Ctrl+C to stop)…")
    try:
        while True:
            time.sleep(1)
            # Exit if either subprocess died unexpectedly
            for proc in processes:
                if proc.poll() is not None:
                    print(f"{RED}A subprocess exited unexpectedly. Shutting down.{RESET}")
                    cleanup()
    except KeyboardInterrupt:
        cleanup()
