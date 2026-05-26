param(
  [switch]$Start,
  [switch]$WithFrp,
  [switch]$NoReset,
  [string]$Branch,
  [string]$Repo,
  [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$DefaultRepoUrl = 'https://github.com/6Leokk/cc-web-enhance.git'
$DefaultBranch = 'main'
$GitHubProxyBase = 'https://gh-proxy.com/'

if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
  $DefaultInstallDir = Join-Path (Get-Location).Path 'cc-web-enhance'
} else {
  $DefaultInstallDir = Join-Path $env:LOCALAPPDATA 'cc-web-enhance'
}

if ([string]::IsNullOrWhiteSpace($Repo)) {
  $Repo = if ([string]::IsNullOrWhiteSpace($env:CC_WEB_REPO_URL)) { $DefaultRepoUrl } else { $env:CC_WEB_REPO_URL }
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = if ([string]::IsNullOrWhiteSpace($env:CC_WEB_BRANCH)) { $DefaultBranch } else { $env:CC_WEB_BRANCH }
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = if ([string]::IsNullOrWhiteSpace($env:CC_WEB_INSTALL_DIR)) { $DefaultInstallDir } else { $env:CC_WEB_INSTALL_DIR }
}

function Write-Info {
  param([string]$Message)
  Write-Host "[install-cn] $Message"
}

function Proxy-GitUrl {
  param([string]$Url)
  if ($Url.StartsWith('https://github.com/')) {
    return $GitHubProxyBase + $Url
  }
  return $Url
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = ''
  )

  $exitCode = $null
  $previousLocation = $null
  if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
    $previousLocation = Get-Location
    Set-Location -LiteralPath $WorkingDirectory
  }

  try {
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    if ($null -ne $previousLocation) {
      Set-Location -LiteralPath $previousLocation
    }
  }

  if ($null -eq $exitCode) {
    throw "Command execution failed (no exit code): $FilePath $($Arguments -join ' ')"
  }
  if ($exitCode -ne 0) {
    throw "Command failed ($exitCode): $FilePath $($Arguments -join ' ')"
  }
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name. Install Node.js >= 18, npm, and git first, then rerun this script."
  }
}

function Require-NodeVersion {
  $nodeVersion = & node -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to detect Node.js version.'
  }
  $major = [int](($nodeVersion -split '\.')[0])
  if ([int]$major -lt 18) {
    throw "Node.js >= 18 is required. Current version: $nodeVersion"
  }
}

function Ensure-InstallParent {
  $script:InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
  $parent = Split-Path -Parent $InstallDir
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
}

function Try-Git {
  param([string[]]$Arguments)
  $ErrorActionPreference = 'SilentlyContinue'
  & git @Arguments >$null 2>$null
  return $LASTEXITCODE -eq 0
}

function Invoke-GitWithFallback {
  param(
    [string[]]$ProxyArgs,
    [string[]]$DirectArgs,
    [string]$Description,
    [string]$CleanupPath = ''
  )

  Write-Info "$Description (via proxy)..."
  $ok = Try-Git -Arguments $ProxyArgs
  if ($ok) { return }

  if ($CleanupPath -and (Test-Path -LiteralPath $CleanupPath)) {
    Write-Info "Cleaning up partial directory from failed proxy attempt..."
    Remove-Item -Recurse -Force -LiteralPath $CleanupPath
  }

  Write-Info "Proxy failed, retrying $Description direct..."
  $ok = Try-Git -Arguments $DirectArgs
  if (-not $ok) {
    throw "$Description failed both via proxy and direct. Check your network."
  }
}

function Install-OrUpdateRepo {
  $proxyRepo = Proxy-GitUrl $Repo
  $proxyInsteadOf = "url.$GitHubProxyBase" + "https://github.com/.insteadOf=https://github.com/"

  if (-not (Test-Path -LiteralPath $InstallDir)) {
    Invoke-GitWithFallback `
      -ProxyArgs @('clone', '--branch', $Branch, $proxyRepo, $InstallDir) `
      -DirectArgs @('clone', '--branch', $Branch, $Repo, $InstallDir) `
      -Description 'Git clone' `
      -CleanupPath $InstallDir

    Invoke-Checked -FilePath 'git' -Arguments @('-C', $InstallDir, 'remote', 'set-url', 'origin', $Repo)
    return
  }

  if (-not (Test-Path -LiteralPath (Join-Path $InstallDir '.git'))) {
    throw "Refusing to use $InstallDir because it is not a git checkout. Choose another directory with -InstallDir or CC_WEB_INSTALL_DIR."
  }

  Write-Info "Updating existing checkout in $InstallDir"
  Invoke-Checked -FilePath 'git' -Arguments @('-C', $InstallDir, 'remote', 'set-url', 'origin', $Repo)

  Invoke-GitWithFallback `
    -ProxyArgs @('-C', $InstallDir, '-c', $proxyInsteadOf, 'fetch', 'origin', $Branch) `
    -DirectArgs @('-C', $InstallDir, 'fetch', 'origin', $Branch) `
    -Description 'Git fetch'

  & git -C $InstallDir show-ref --verify --quiet "refs/heads/$Branch"
  $branchExists = $LASTEXITCODE -eq 0
  if ($branchExists) {
    Invoke-Checked -FilePath 'git' -Arguments @('-C', $InstallDir, 'checkout', $Branch)
  } else {
    # Equivalent guarded command: checkout --track "origin/$Branch"
    Invoke-Checked -FilePath 'git' -Arguments @('-C', $InstallDir, 'checkout', '--track', "origin/$Branch")
  }

  Invoke-GitWithFallback `
    -ProxyArgs @('-C', $InstallDir, '-c', $proxyInsteadOf, 'pull', '--ff-only', 'origin', $Branch) `
    -DirectArgs @('-C', $InstallDir, 'pull', '--ff-only', 'origin', $Branch) `
    -Description 'Git pull --ff-only'
}

function Prepare-EnvFile {
  $envPath = Join-Path $InstallDir '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    $examplePath = Join-Path $InstallDir '.env.example'
    if (Test-Path -LiteralPath $examplePath) {
      Copy-Item -LiteralPath $examplePath -Destination $envPath
      Write-Info 'Created .env from .env.example'
    } else {
      Write-Warning '.env.example not found; skipping .env creation'
    }
  } else {
    Write-Info 'Keeping existing .env'
  }
}

function Run-Deploy {
  $deployArgs = @()
  if ($NoReset) {
    $deployArgs += '--no-reset'
  }
  if ($WithFrp) {
    $deployArgs += '--with-frp'
  }
  if ($Start) {
    $deployArgs += '--start'
  }

  Write-Info 'Running mainland Windows deployment preset'
  $wrapper = Join-Path $InstallDir 'scripts\deploy\windows-cn.cmd'
  Invoke-Checked -FilePath $wrapper -Arguments $deployArgs -WorkingDirectory $InstallDir
}

function Show-NextSteps {
  if ($Start) {
    return
  }

  Write-Host ''
  Write-Info "Installed to: $InstallDir"
  Write-Info 'Start later with:'
  Write-Host "  cd /d `"$InstallDir`""
  Write-Host '  npm start'
}

# Usage examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1'))) -Start"
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1'))) -InstallDir D:\cc-web-enhance -Start"
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1'))) -WithFrp -NoReset"

Require-Command git
Require-Command node
Require-Command npm
Require-NodeVersion
Ensure-InstallParent
Install-OrUpdateRepo
Prepare-EnvFile
Run-Deploy
Show-NextSteps
