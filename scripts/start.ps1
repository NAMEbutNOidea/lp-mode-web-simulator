$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '未找到 Node.js。请安装 Node.js 22.13 或更高版本后重试：https://nodejs.org'
}

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
    throw '未找到 pnpm。请先执行 npm install -g pnpm，然后重新启动。'
}
$pnpm = $pnpmCommand.Source

Set-Location -LiteralPath $projectDir

if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules'))) {
    Write-Host '首次运行：正在安装依赖…' -ForegroundColor Cyan
    & $pnpm install
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}

Write-Host ''
Write-Host '少模光纤仿真器正在启动…' -ForegroundColor Cyan
Write-Host '浏览器地址：http://127.0.0.1:3000' -ForegroundColor Green
Write-Host '关闭此窗口即可停止网页服务。' -ForegroundColor DarkGray
Write-Host ''
& $pnpm dev --host 127.0.0.1
exit $LASTEXITCODE
