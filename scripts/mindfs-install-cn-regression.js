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

function assertNotIncludes(haystack, needle, message) {
  assert(!String(haystack).includes(needle), `${message}: found ${needle}`);
}

function extractSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, `missing section start: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert(end >= 0, `missing section end: ${endMarker}`);
  return text.slice(start, end);
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

const readmeMindfsSection = extractSection(
  readme,
  '### MindFS 国内 Windows 一键安装',
  '## Windows 已 clone 仓库',
);
assertIncludes(readmeMindfsSection, 'MindFS 国内 Windows 一键安装', 'Chinese README should document the MindFS mainland installer');
assertIncludes(readmeMindfsSection, 'scripts/install-mindfs-cn.ps1', 'Chinese README should point to the MindFS installer script');
assertIncludes(readmeMindfsSection, 'https://v6.gh-proxy.org/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-mindfs-cn.ps1', 'Chinese README should use a raw proxy for the copy-paste command');
assertIncludes(readmeMindfsSection, 'irm https://v6.gh-proxy.org/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-mindfs-cn.ps1 | iex', 'Chinese README should use a short complete copy-paste command');
assertNotIncludes(readmeMindfsSection, 'scriptblock]::Create((irm', 'Chinese README should avoid the long scriptblock command for MindFS');
assertIncludes(readmeMindfsSection, 'MINDFS_GITHUB_PROXY_BASE', 'Chinese README should document custom proxy override');
assertIncludes(readmeMindfsSection, '$env:LOCALAPPDATA\\Programs\\mindfs', 'Chinese README should document the MindFS install prefix');

const englishMindfsSection = extractSection(
  englishReadme,
  '### MindFS Mainland Windows One-Command Install',
  '## Windows With An Existing Clone',
);
assertIncludes(englishMindfsSection, 'MindFS Mainland Windows One-Command Install', 'English README should document the MindFS mainland installer');
assertIncludes(englishMindfsSection, 'scripts/install-mindfs-cn.ps1', 'English README should point to the MindFS installer script');
assertIncludes(englishMindfsSection, 'irm https://v6.gh-proxy.org/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-mindfs-cn.ps1 | iex', 'English README should use a short complete copy-paste command');

console.log('mindfs mainland installer regression checks passed');
