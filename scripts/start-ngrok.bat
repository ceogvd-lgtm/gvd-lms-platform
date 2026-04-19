@echo off
REM =====================================================================
REM  LMS Platform - Ngrok Tunnel Launcher
REM  Mo 2 tunnel HTTP cho frontend (3000) va backend (4000)
REM =====================================================================

set NGROK_EXE=C:\Users\Admin\ngrok-v3-stable-windows-amd64\ngrok.exe

if not exist "%NGROK_EXE%" (
    echo [ERROR] Khong tim thay ngrok.exe tai: %NGROK_EXE%
    echo Vui long kiem tra lai duong dan trong file nay.
    pause
    exit /b 1
)

echo =====================================================================
echo  LMS Platform - Khoi dong Ngrok Tunnel
echo =====================================================================
echo.
echo  Frontend (Next.js):  http://localhost:3000
echo  Backend  (NestJS):   http://localhost:4000
echo.
echo  Sau khi Ngrok khoi dong, hay mo: http://localhost:4040
echo  de xem URL cong khai cho tung tunnel.
echo.
echo  Nhan Ctrl+C de dung Ngrok.
echo =====================================================================
echo.

REM Dung lenh "ngrok http" voi --log=stdout de xem URL tren terminal
REM Neu muon chi mo tunnel frontend:
REM   "%NGROK_EXE%" http 3000 --host-header=localhost:3000
REM
REM Neu muon mo ca 2 tunnel cung luc, can tao file ngrok.yml voi 2 tunnels
REM Mac dinh script nay chi mo frontend (de khach test tren dien thoai).

"%NGROK_EXE%" http 3000 --host-header=localhost:3000

pause
