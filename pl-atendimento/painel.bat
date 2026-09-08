@echo off
cd /d "%~dp0"
start "" http://localhost:8781
python painel.py
