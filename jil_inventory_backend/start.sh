#!/usr/bin/env bash
set -e
source .venv/bin/activate
./.venv/bin/python init_db.py
uvicorn main:app --reload --host 0.0.0.0 --port 8000
