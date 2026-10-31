$ErrorActionPreference = 'Stop'
$src = 'C:\sites\glp'; $g = 'C:\sites\glp-build'; $dart = 'C:\tools\dart-sdk\bin\dart.exe'
$commit = (Select-String -Path "$src\Dockerfile" -Pattern 'GLP_COMMIT=(\w+)').Matches[0].Groups[1].Value
if (!(Test-Path $g)) { git init $g; git -C $g remote add origin https://github.com/EShapiro2/GLP.git }
git -C $g fetch --depth 1 origin $commit
git -C $g checkout -f FETCH_HEAD
Copy-Item "$src\live\overlay\*" $g -Recurse -Force
$web = "$g\live_server\web"
New-Item "$web\stack" -ItemType Directory -Force | Out-Null
Copy-Item "$src\index.html", "$src\data.js" $web -Force
Copy-Item "$src\stack\*" "$web\stack" -Recurse -Force
Copy-Item "$src\live\web\*" $web -Recurse -Force
Set-Location "$g\live_server"
& $dart pub get
