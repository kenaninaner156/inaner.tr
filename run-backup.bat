@echo off
chcp 65001 >nul
title Inaner Logistics - Otomatik Senkron Yedekleme

echo ==================================================
echo   INANER LOGISTICS - SENKRON YEDEKLEME BASLATILIYOR
echo ==================================================
echo.

cd /d "%~dp0"

:: Node.js kontrolu
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi! Lutfen Node.js kurulu oldugundan emin olun.
    pause
    exit /b 1
)

:: Ag surucusu veya varsayilan hedef kontrolu
:: Eger D: veya Z: ag surucusu bagli ise hedefi belirler
if exist "D:\Backup" (
    echo [BILGI] D: Ag surucusu [Keenetic USB - Backup] tespit edildi.
    set BACKUP_DEST=--dest="D:\Backup"
) else if exist "D:\Inaner_Backups" (
    echo [BILGI] D: Ag surucusu [Keenetic USB] tespit edildi.
    set BACKUP_DEST=--dest="D:\Inaner_Backups"
) else if exist "Z:\Backup" (
    echo [BILGI] Z: Ag surucusu [Keenetic USB - Backup] tespit edildi.
    set BACKUP_DEST=--dest="Z:\Backup"
) else if exist "Z:\Inaner_Backups" (
    echo [BILGI] Z: Ag surucusu [Keenetic USB] tespit edildi.
    set BACKUP_DEST=--dest="Z:\Inaner_Backups"
) else (
    echo [BILGI] Ag surucusu bagli degil. Yerel backups klasorune yazilacak.
    set BACKUP_DEST=
)

echo.
node scripts\sync-engine.mjs %BACKUP_DEST%

echo.
echo Islem tamamlandi. Pencereyi kapatabilirsiniz.
timeout /t 10 >nul 2>&1 || ping 127.0.0.1 -n 11 >nul
