@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 烟雨江湖 网页版工具

py -3 -V >nul 2>nul
if not errorlevel 1 (
    py -3 serve.py %*
    goto :end
)

python -V >nul 2>nul
if not errorlevel 1 (
    python serve.py %*
    goto :end
)

echo.
echo [错误] 没有找到 Python 3。
echo        请先安装 Python（https://www.python.org/downloads/），
echo        安装时记得勾选 "Add Python to PATH"。
echo.
echo        或者直接双击 serve.py 也可以启动。
echo.
pause

:end