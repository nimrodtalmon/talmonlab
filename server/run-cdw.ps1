$env:HF_HOME = 'C:\sites\cdw-cache'
Set-Location C:\sites\cdw
.\.venv\Scripts\waitress-serve --host 127.0.0.1 --port 4201 app:app
