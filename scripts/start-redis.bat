@echo off
set REDIS_DIR=C:\Users\nared\AppData\Local\Microsoft\WinGet\Packages\taizod1024.redis-windows-fork_Microsoft.Winget.Source_8wekyb3d8bbwe\Redis-8.8.0-Windows-x64-msys2
set PATH=%REDIS_DIR%;%PATH%
cd /d %REDIS_DIR%
redis-server.exe redis.conf
