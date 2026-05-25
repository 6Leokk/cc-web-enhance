#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const installerPath = path.join(root, 'scripts', 'install-mindfs-cn.ps1');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(haystack, needle, message) {
  assert(String(haystack).includes(needle), `${message}: missing ${needle}`);
}

assert(fs.existsSync(installerPath), 'mindfs mainland Windows installer should exist');

const installer = fs.readFileSync(installerPath, 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const englishReadme = fs.readFileSync(path.join(root, 'README.en.md'), 'utf8');

assertIncludes(installer, '[CmdletBinding()]', 'installer should support PowerShell parameters');
assertIncludes(installer, '$Repo = "a9gent/mindfs"', 'installer should target the upstream mindfs repository');
assertIncludes(installer, '$env:LOCALAPPDATA\\Programs\\mindfs', 'installer should keep the upstream default install prefix');
assertIncludes(installer, 'MINDFS_GITHUB_PROXY_BASE', 'installer should support a configurable GitHub proxy base');
assertIncludes(installer, 'https://gh.llkk.cc', 'installer should include a mainland GitHub proxy fallback');
assertIncludes(installer, 'https://gh-proxy.com', 'installer should include a second GitHub proxy fallback');
assertIncludes(installer, 'https://v6.gh-proxy.org', 'installer should include a raw metadata fallback that works in mainland networks');
assertIncludes(installer, '$Url -like "https://raw.githubusercontent.com/*"', 'installer should try raw metadata directly before proxy fallbacks');
assertIncludes(installer, 'Get-UrlCandidates $ReleaseNotesUrl', 'installer should apply proxy fallback to latest-version metadata');
assertIncludes(installer, 'Get-UrlCandidates $Url', 'installer should apply proxy fallback to release asset downloads');
assertIncludes(installer, 'Invoke-DownloadWithFallback', 'installer should retry downloads through candidate URLs');
assertIncludes(installer, 'mindfs_${Version}_${OS}_${Arch}.zip', 'installer should use upstream release asset naming');
assertIncludes(installer, 'agents.json', 'installer should preserve upstream agent config installation');
assertIncludes(installer, 'share\\mindfs\\web', 'installer should preserve upstream web asset installation');
assertIncludes(installer, 'Broadcast-EnvironmentChange', 'installer should refresh Windows environment settings');

assertIncludes(readme, 'MindFS 国内 Windows 一键安装', 'Chinese README should document the MindFS mainland installer');
assertIncludes(readme, 'scripts/install-mindfs-cn.ps1', 'Chinese README should point to the MindFS installer script');
assertIncludes(readme, 'https://v6.gh-proxy.org/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-mindfs-cn.ps1', 'Chinese README should use a raw proxy for the copy-paste command');
assertIncludes(readme, 'MINDFS_GITHUB_PROXY_BASE', 'Chinese README should document custom proxy override');
assertIncludes(readme, '$env:LOCALAPPDATA\\Programs\\mindfs', 'Chinese README should document the MindFS install prefix');

assertIncludes(englishReadme, 'MindFS Mainland Windows One-Command Install', 'English README should document the MindFS mainland installer');
assertIncludes(englishReadme, 'scripts/install-mindfs-cn.ps1', 'English README should point to the MindFS installer script');

console.log('mindfs mainland installer regression checks passed');
