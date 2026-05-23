#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FRP_ROOT = path.join(REPO_ROOT, 'frp');
const BIN_DIR = path.join(FRP_ROOT, 'bin');
const TMP_DIR = path.join(FRP_ROOT, 'tmp');
const GITHUB_API = 'https://api.github.com/repos/fatedier/frp';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = '1';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeVersion(version) {
  const raw = String(version || '').trim();
  if (!raw || raw === 'latest') return '';
  return raw.startsWith('v') ? raw.slice(1) : raw;
}

function normalizeTargetArch(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (raw) return raw;

  const platformMap = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'windows',
    freebsd: 'freebsd',
  };
  const archMap = {
    x64: 'amd64',
    arm64: 'arm64',
    arm: 'arm',
  };
  const platform = platformMap[process.platform] || 'linux';
  const arch = archMap[process.arch] || 'amd64';
  return `${platform}_${arch}`;
}

function assetNameFor({ version, targetArch }) {
  const suffix = targetArch.startsWith('windows_') ? 'zip' : 'tar.gz';
  return `frp_${normalizeVersion(version)}_${targetArch}.${suffix}`;
}

function applyDownloadUrlPrefix(url, prefix) {
  const rawUrl = String(url || '').trim();
  const rawPrefix = String(prefix || '').trim();
  if (!rawPrefix) return rawUrl;
  return `${rawPrefix.replace(/\/+$/, '')}/${rawUrl}`;
}

function buildMirrorAssetUrl({ baseUrl, version, assetName }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedVersion = normalizeVersion(version);
  if (!base) throw new Error('FRP_DOWNLOAD_BASE_URL is empty');
  if (!normalizedVersion) throw new Error('FRP_VERSION is required when using FRP_DOWNLOAD_BASE_URL');
  if (!assetName) throw new Error('assetName is required when using FRP_DOWNLOAD_BASE_URL');
  return `${base}/v${normalizedVersion}/${assetName}`;
}

function normalizeSha256(value) {
  const sha256 = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) return '';
  return sha256;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'cc-web-enhance-frp-downloader',
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API request failed (${res.statusCode}): ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`GitHub API response was not JSON: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath, { flags: 'w' });
    const cleanup = () => {
      file.close(() => {});
      try { fs.unlinkSync(targetPath); } catch {}
    };

    https.get(url, { headers: { 'User-Agent': 'cc-web-enhance-frp-downloader' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(() => {});
        try { fs.unlinkSync(targetPath); } catch {}
        downloadFile(res.headers.location, targetPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        cleanup();
        reject(new Error(`Download failed (${res.statusCode}): ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

async function resolveRelease(version) {
  const normalized = normalizeVersion(version);
  if (!normalized) return requestJson(`${GITHUB_API}/releases/latest`);
  return requestJson(`${GITHUB_API}/releases/tags/v${normalized}`);
}

function resolveDirectDownload(options = {}) {
  const downloadUrl = String(options.downloadUrl || '').trim();
  const downloadBaseUrl = String(options.downloadBaseUrl || '').trim();
  if (!downloadUrl && !downloadBaseUrl) return null;

  const version = normalizeVersion(options.version);
  if (!version) {
    throw new Error('FRP_VERSION or --version is required when using a direct frp mirror download');
  }

  const sha256 = normalizeSha256(options.sha256);
  if (!sha256) {
    throw new Error('FRP_DOWNLOAD_SHA256 or --sha256 is required when using a direct frp mirror download');
  }

  const targetArch = normalizeTargetArch(options.arch);
  const assetName = assetNameFor({ version, targetArch });
  const url = downloadUrl || buildMirrorAssetUrl({
    baseUrl: downloadBaseUrl,
    version,
    assetName,
  });

  return {
    version,
    tag: `v${version}`,
    asset: {
      name: assetName,
      browser_download_url: url,
      digest: `sha256:${sha256}`,
    },
    downloadUrl: url,
    sha256,
    targetArch,
  };
}

function safeRemoveTempDir(dir) {
  const resolved = path.resolve(dir);
  const allowedRoot = path.resolve(TMP_DIR);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(`Refusing to clean unexpected temp directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function extractArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const result = spawnSync('tar', ['-xf', archivePath, '-C', destDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Failed to extract frp archive with tar: ${result.stderr || result.stdout || 'unknown error'}`);
  }
}

function findExtractedBinary(extractDir, name) {
  const wanted = process.platform === 'win32' ? `${name}.exe` : name;
  const stack = [extractDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === wanted || entry.name === `${name}.exe`) return entryPath;
    }
  }
  throw new Error(`Could not find ${wanted} in extracted frp archive`);
}

function installBinary(sourcePath, targetPath) {
  fs.copyFileSync(sourcePath, targetPath);
  if (!targetPath.endsWith('.exe')) fs.chmodSync(targetPath, 0o755);
}

async function downloadFrp(options = {}) {
  const targetArch = normalizeTargetArch(options.arch);
  const directDownload = resolveDirectDownload({ ...options, arch: targetArch });
  let version;
  let tag;
  let asset;
  let downloadUrl;
  let expectedSha256;

  if (directDownload) {
    version = directDownload.version;
    tag = directDownload.tag;
    asset = directDownload.asset;
    downloadUrl = directDownload.downloadUrl;
    expectedSha256 = directDownload.sha256;
  } else {
    const release = await resolveRelease(options.version);
    if (release.draft || release.prerelease) {
      throw new Error(`Refusing to use draft/prerelease frp release: ${release.tag_name}`);
    }

    version = normalizeVersion(release.tag_name);
    tag = release.tag_name;
    const expectedName = assetNameFor({ version, targetArch });
    asset = (release.assets || []).find((item) => item.name === expectedName);
    if (!asset) throw new Error(`Could not find frp release asset: ${expectedName}`);
    if (!asset.digest || !asset.digest.startsWith('sha256:')) {
      throw new Error(`frp release asset does not include a SHA256 digest: ${expectedName}`);
    }
    downloadUrl = applyDownloadUrlPrefix(asset.browser_download_url, options.githubProxyBase);
    expectedSha256 = asset.digest.slice('sha256:'.length).toLowerCase();
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(TMP_DIR, 'download-'));
  const archivePath = path.join(tempDir, asset.name);

  try {
    await downloadFile(downloadUrl, archivePath);
    const actualSha256 = sha256File(archivePath);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`SHA256 mismatch for ${asset.name}: expected ${expectedSha256}, got ${actualSha256}`);
    }

    const extractDir = path.join(tempDir, 'extract');
    extractArchive(archivePath, extractDir);

    const binaryExt = targetArch.startsWith('windows_') ? '.exe' : '';
    const frpcTarget = path.join(BIN_DIR, `frpc${binaryExt}`);
    const frpsTarget = path.join(BIN_DIR, `frps${binaryExt}`);
    installBinary(findExtractedBinary(extractDir, 'frpc'), frpcTarget);
    installBinary(findExtractedBinary(extractDir, 'frps'), frpsTarget);

    const checksum = [
      `version=${version}`,
      `tag=${tag}`,
      `asset=${asset.name}`,
      `url=${downloadUrl}`,
      `sha256=${actualSha256}`,
      `targetArch=${targetArch}`,
      `downloadedAt=${new Date().toISOString()}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(BIN_DIR, 'checksum.txt'), checksum);

    return {
      version,
      tag,
      asset: asset.name,
      sha256: actualSha256,
      frpc: frpcTarget,
      frps: frpsTarget,
      checksum: path.join(BIN_DIR, 'checksum.txt'),
    };
  } finally {
    safeRemoveTempDir(tempDir);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await downloadFrp({
    version: args.version || process.env.FRP_VERSION || '',
    arch: args.arch || process.env.FRP_ARCH || '',
    downloadBaseUrl: args['download-base-url'] || process.env.FRP_DOWNLOAD_BASE_URL || '',
    downloadUrl: args['download-url'] || process.env.FRP_DOWNLOAD_URL || '',
    sha256: args.sha256 || process.env.FRP_DOWNLOAD_SHA256 || '',
    githubProxyBase: args['github-proxy-base'] || process.env.FRP_DOWNLOAD_GITHUB_PROXY_BASE || '',
  });
  console.log(`Downloaded frp ${result.tag}`);
  console.log(`Asset: ${result.asset}`);
  console.log(`SHA256: ${result.sha256}`);
  console.log(`Installed: ${path.relative(REPO_ROOT, result.frpc)} and ${path.relative(REPO_ROOT, result.frps)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  applyDownloadUrlPrefix,
  assetNameFor,
  buildMirrorAssetUrl,
  downloadFrp,
  normalizeTargetArch,
  normalizeVersion,
  parseArgs,
  resolveDirectDownload,
  resolveRelease,
};
