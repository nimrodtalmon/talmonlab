# The copy on the server has the secrets filled in (GOVERN_PASS, GITHUB_TOKEN,
# SESSION_SECRET) and is readable only by Administrators and SYSTEM.
$env:BASE_PATH = '/lab'
$env:GITHUB_REPO = 'nimrodtalmon/BGULAB'
$env:GOVERN_PASS = '...'
$env:GITHUB_TOKEN = '...'
$env:SESSION_SECRET = '...'
Set-Location C:\sites\lab
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 4101
