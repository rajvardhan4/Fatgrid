@echo off
title FatGrid Ultimate Scraper
echo ========================================================
echo         FatGrid Ultimate Standalone Scraper
echo ========================================================
echo.
echo Choose an option:
echo  1. Scrape Top 1,000 Publishers (Fast - Top Countries)
echo  2. Scrape Top 5,000 Publishers (Deep Scrape)
echo  3. Scrape 500 Publishers with 100KB split (For strict limits)
echo  4. Custom (Enter your own command arguments)
echo.
set /p opt="Enter choice (1-4) [default: 1]: "

if "%opt%"=="" set opt=1
if "%opt%"=="1" (
    python fatgrid_ultimate_scraper.py --countries top10 --limit 1000 --max-file-kb 100
) else if "%opt%"=="2" (
    python fatgrid_ultimate_scraper.py --countries top20 --limit 5000
) else if "%opt%"=="3" (
    python fatgrid_ultimate_scraper.py --countries top10 --limit 500 --max-file-kb 100
) else if "%opt%"=="4" (
    set /p custom_args="Enter python scraper arguments: "
    python fatgrid_ultimate_scraper.py %custom_args%
)

echo.
echo [✓] Done! Output files are in the 'outputs' folder.
pause
