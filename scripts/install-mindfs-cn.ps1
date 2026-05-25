# MindFS mainland China installer for Windows (PowerShell).
# Downloads MindFS release metadata and assets through configurable GitHub
# proxy fallbacks, then installs with the same layout as the upstream script.
#
# Usage:
#   irm https://v6.gh-proxy.org/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-mindfs-cn.ps1 | iex
#
[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$Prefix = "$env:LOCALAPPDATA\Programs\mindfs",
    [string[]]$GithubProxyBase = @($env:MINDFS_GITHUB_PROXY_BASE)
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$Repo = "a9gent/mindfs"
$ReleaseNotesUrl = "https://raw.githubusercontent.com/$Repo/main/release-notes.md"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
}

function Write-Info([string]$Message) {
    Write-Host "[mindfs-cn] $Message"
}

function Add-ToCurrentSessionPath([string]$Dir) {
    if (-not $Dir) { return }
    $segments = @($env:Path -split ';' | Where-Object { $_ -and $_.Trim() -ne "" })
    if ($segments | Where-Object { $_.TrimEnd('\') -ieq $Dir.TrimEnd('\') }) {
        return
    }
    $env:Path = "$Dir;$env:Path"
}

function Broadcast-EnvironmentChange {
    try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MindFSEnvBroadcast {
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint Msg,
        UIntPtr wParam,
        string lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);
}
"@ -ErrorAction SilentlyContinue | Out-Null

        $HWND_BROADCAST = [IntPtr]0xffff
        $WM_SETTINGCHANGE = 0x001A
        $SMTO_ABORTIFHUNG = 0x0002
        $result = [UIntPtr]::Zero
        [MindFSEnvBroadcast]::SendMessageTimeout(
            $HWND_BROADCAST,
            $WM_SETTINGCHANGE,
            [UIntPtr]::Zero,
            "Environment",
            $SMTO_ABORTIFHUNG,
            5000,
            [ref]$result
        ) | Out-Null
    } catch {
    }
}

function Get-Arch {
    $a = $env:PROCESSOR_ARCHITECTURE
    switch -Wildcard ($a) {
        "AMD64" { return "amd64" }
        "ARM64" { return "arm64" }
        "x86" {
            if ($env:PROCESSOR_ARCHITEW6432 -eq "AMD64") { return "amd64" }
            throw "32-bit x86 is not supported."
        }
        default { throw "Unsupported architecture: $a" }
    }
}

function Normalize-Tag([string]$Tag) {
    if (-not $Tag) { return "" }
    return "v" + ($Tag -replace '^v', '')
}

function Join-ProxyUrl([string]$ProxyBase, [string]$Url) {
    if ([string]::IsNullOrWhiteSpace($ProxyBase)) { return "" }
    return $ProxyBase.TrimEnd('/') + "/" + $Url
}

function Get-UrlCandidates([string]$Url) {
    $candidates = New-Object System.Collections.Generic.List[string]
    $customProxyCandidates = @()
    foreach ($proxyBase in $GithubProxyBase) {
        if ([string]::IsNullOrWhiteSpace($proxyBase)) { continue }
        $customProxyCandidates += ($proxyBase -split "[,;]" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    $rawProxyCandidates = @(
        "https://v6.gh-proxy.org",
        "https://gh-proxy.com",
        "https://ghproxy.net",
        "https://gh.llkk.cc"
    )
    $assetProxyCandidates = @(
        "https://ghproxy.net",
        "https://gh-proxy.com",
        "https://gh.llkk.cc",
        "https://v6.gh-proxy.org"
    )

    if ($Url -like "https://raw.githubusercontent.com/*") {
        $candidates.Add($Url)
        foreach ($proxy in $customProxyCandidates + $rawProxyCandidates) {
            $candidate = Join-ProxyUrl $proxy $Url
            if ($candidate -and -not $candidates.Contains($candidate)) {
                $candidates.Add($candidate)
            }
        }
    } else {
        foreach ($proxy in $customProxyCandidates + $assetProxyCandidates) {
            $candidate = Join-ProxyUrl $proxy $Url
            if ($candidate -and -not $candidates.Contains($candidate)) {
                $candidates.Add($candidate)
            }
        }
        if (-not $candidates.Contains($Url)) {
            $candidates.Add($Url)
        }
    }

    return $candidates.ToArray()
}

function Invoke-DownloadWithFallback {
    param(
        [Parameter(Mandatory = $true)][string[]]$Urls,
        [string]$OutFile = ""
    )

    $errors = New-Object System.Collections.Generic.List[string]
    $headers = @{ "User-Agent" = "mindfs-cn-installer" }
    foreach ($candidate in $Urls) {
        try {
            Write-Info "Downloading $candidate"
            if ([string]::IsNullOrWhiteSpace($OutFile)) {
                return Invoke-WebRequest -Uri $candidate -UseBasicParsing -Headers $headers
            }
            Invoke-WebRequest -Uri $candidate -OutFile $OutFile -UseBasicParsing -Headers $headers
            if (-not (Test-Path -LiteralPath $OutFile -PathType Leaf)) {
                throw "No output file was created."
            }
            if ((Get-Item -LiteralPath $OutFile).Length -le 0) {
                throw "Downloaded file is empty."
            }
            return $true
        } catch {
            $errors.Add("$candidate -> $($_.Exception.Message)")
            Write-Warning "Download failed: $candidate"
        }
    }

    throw "All download attempts failed:`n$($errors -join "`n")"
}

$OS = "windows"
$Arch = Get-Arch

if (-not $Version) {
    Write-Info "Fetching latest release version..."
    $metadata = Invoke-DownloadWithFallback -Urls (Get-UrlCandidates $ReleaseNotesUrl)
    $firstLine = (($metadata.Content -split "`r?`n") | Select-Object -First 1).Trim()
    if ($firstLine -match '^#\s+MindFS\s+(v?[0-9]+(\.[0-9]+){1,3}[^\s]*)') {
        $Version = $Matches[1]
    }
    if (-not $Version) {
        throw "Could not determine latest version. Use -Version to specify."
    }
}

$Version = Normalize-Tag $Version

Write-Info "Installing mindfs $Version for $OS/$Arch"
Write-Info "Prefix: $Prefix"

$Filename = "mindfs_${Version}_${OS}_${Arch}.zip"
$Url = "https://github.com/$Repo/releases/download/$Version/$Filename"
$TmpDir = Join-Path $env:TEMP ("mindfs_install_" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

try {
    $ZipPath = Join-Path $TmpDir $Filename
    Invoke-DownloadWithFallback -Urls (Get-UrlCandidates $Url) -OutFile $ZipPath | Out-Null

    Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force
    $PkgDir = Join-Path $TmpDir "mindfs_${Version}_${OS}_${Arch}"

    if (-not (Test-Path $PkgDir -PathType Container)) {
        throw "Unexpected archive structure (expected $PkgDir)."
    }

    $BinSrc = Join-Path $PkgDir "mindfs.exe"
    if (-not (Test-Path $BinSrc -PathType Leaf)) {
        throw "Binary not found in archive: $BinSrc"
    }

    $BinDir = Join-Path $Prefix "bin"
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
    Copy-Item -Force $BinSrc (Join-Path $BinDir "mindfs.exe")
    Write-Info "Binary -> $(Join-Path $BinDir 'mindfs.exe')"

    $AgentsSrc = Join-Path $PkgDir "agents.json"
    if (Test-Path $AgentsSrc -PathType Leaf) {
        $ShareDir = Join-Path $Prefix "share\mindfs"
        New-Item -ItemType Directory -Force -Path $ShareDir | Out-Null
        Copy-Item -Force $AgentsSrc (Join-Path $ShareDir "agents.json")
        Write-Info "Agents -> $(Join-Path $ShareDir 'agents.json')"
    }

    $WebSrc = Join-Path $PkgDir "web"
    if (Test-Path $WebSrc -PathType Container) {
        $WebDest = Join-Path $Prefix "share\mindfs\web"
        if (Test-Path $WebDest) { Remove-Item -Recurse -Force $WebDest }
        New-Item -ItemType Directory -Force -Path (Split-Path $WebDest) | Out-Null
        Copy-Item -Recurse $WebSrc $WebDest
        Write-Info "Web -> $WebDest"
    }

    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($UserPath -notlike "*$BinDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$BinDir;$UserPath", "User")
        Add-ToCurrentSessionPath $BinDir
        Broadcast-EnvironmentChange
        Write-Info "Added $BinDir to your user PATH."
    } else {
        Add-ToCurrentSessionPath $BinDir
    }

    Write-Host ""
    Write-Host "Done. mindfs installed to $BinDir\mindfs.exe"
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
