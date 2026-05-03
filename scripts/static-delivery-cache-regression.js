#!/usr/bin/env node

const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let createStaticAssetCompressionCache;
try {
  ({ createStaticAssetCompressionCache } = require('../lib/static-delivery'));
} catch (err) {
  throw new Error(`Expected lib/static-delivery.js with createStaticAssetCompressionCache(), got: ${err.message}`);
}

assert(
  typeof createStaticAssetCompressionCache === 'function',
  'Expected createStaticAssetCompressionCache to be exported as a function',
);

const calls = [];
const fakeZlib = {
  brotliCompressSync(data) {
    calls.push({ encoding: 'br', input: Buffer.from(data).toString('utf8') });
    return Buffer.from(`br:${Buffer.from(data).toString('utf8')}`);
  },
  gzipSync(data) {
    calls.push({ encoding: 'gzip', input: Buffer.from(data).toString('utf8') });
    return Buffer.from(`gzip:${Buffer.from(data).toString('utf8')}`);
  },
};

const cache = createStaticAssetCompressionCache({ zlibImpl: fakeZlib });
assert(typeof cache.getCompressedAsset === 'function', 'Expected static delivery cache to expose getCompressedAsset()');

const filePath = path.join('/tmp', 'app.js');
const body = Buffer.from('console.log("hello");');
const statA = { size: body.length, mtimeMs: 1000 };
const statB = { size: body.length + 1, mtimeMs: 2000 };

const firstBr = cache.getCompressedAsset(filePath, statA, body, 'br');
assert(firstBr.toString('utf8') === 'br:console.log("hello");', `Expected first br compression to use compressor, got ${firstBr.toString('utf8')}`);
assert(calls.length === 1 && calls[0].encoding === 'br', `Expected one br compression call, got ${JSON.stringify(calls)}`);

const secondBr = cache.getCompressedAsset(filePath, statA, body, 'br');
assert(secondBr.toString('utf8') === firstBr.toString('utf8'), 'Expected cached br result to be reused');
assert(calls.length === 1, `Expected identical br request to reuse cache without recompressing, got ${JSON.stringify(calls)}`);

const firstGzip = cache.getCompressedAsset(filePath, statA, body, 'gzip');
assert(firstGzip.toString('utf8') === 'gzip:console.log("hello");', `Expected gzip compression to use gzip compressor, got ${firstGzip.toString('utf8')}`);
assert(calls.length === 2 && calls[1].encoding === 'gzip', `Expected gzip encoding to have its own cache key, got ${JSON.stringify(calls)}`);

const updatedBr = cache.getCompressedAsset(filePath, statB, Buffer.from('console.log("hello!")'), 'br');
assert(updatedBr.toString('utf8') === 'br:console.log("hello!")', `Expected updated stat to invalidate cached br result, got ${updatedBr.toString('utf8')}`);
assert(calls.length === 3, `Expected changed stat to trigger recompression, got ${JSON.stringify(calls)}`);

const identity = cache.getCompressedAsset(filePath, statA, body, '');
assert(identity.equals(body), 'Expected identity encoding to return original bytes');
assert(calls.length === 3, `Expected identity path not to touch compressors, got ${JSON.stringify(calls)}`);

console.log('static delivery cache regression passed');
