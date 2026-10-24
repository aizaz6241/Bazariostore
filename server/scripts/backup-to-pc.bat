@echo off
REM ==========================================================================
REM  Bazario: database backup to this computer (READ ONLY: nothing is changed
REM  or deleted in the database, and no file is ever deleted from the folder).
REM  Double-click it, or let Windows Task Scheduler run it every day.
REM
REM  BACKUP_FOLDER: where the copies go. Best is a folder that Google Drive /
REM  OneDrive syncs, so there is also a copy off this computer.
REM ==========================================================================
set "BACKUP_FOLDER=%USERPROFILE%\Documents\Bazario-Backups"
set "PROJECT=E:\Softwares\Abd Call Center"

if not exist "%BACKUP_FOLDER%" mkdir "%BACKUP_FOLDER%"
cd /d "%PROJECT%"
echo [%date% %time%] Backup started >> "%BACKUP_FOLDER%\backup-log.txt"
node server\scripts\backup-to-pc.mjs "%BACKUP_FOLDER%" >> "%BACKUP_FOLDER%\backup-log.txt" 2>&1
if errorlevel 1 (
  echo [%date% %time%] BACKUP FAILED - see the lines above >> "%BACKUP_FOLDER%\backup-log.txt"
  echo Backup FAILED. Open "%BACKUP_FOLDER%\backup-log.txt" to see why.
) else (
  echo [%date% %time%] Backup finished >> "%BACKUP_FOLDER%\backup-log.txt"
  echo Backup done: "%BACKUP_FOLDER%"
)
