import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrl } from '../lib/mediaUrl.js';

test('mediaUrl falls back to placeholder when empty', () => {
  assert.equal(mediaUrl(null), '/placeholder.png');
  assert.equal(mediaUrl(''), '/placeholder.png');
});

test('mediaUrl returns absolute url untouched', () => {
  const url = 'https://cdn.example.com/photo.jpg';
  assert.equal(mediaUrl(url), url);
});

test('mediaUrl prefixes configured base for relative paths', async () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
  const moduleUrl = new URL('../lib/mediaUrl.js', import.meta.url);
  moduleUrl.search = '?case=with-base';
  const { mediaUrl: withBase } = await import(moduleUrl.href);
  assert.equal(withBase('avatar.jpg'), 'https://api.example.com/avatar.jpg');
  assert.equal(withBase('/uploads/x.png'), 'https://api.example.com/uploads/x.png');
  process.env.NEXT_PUBLIC_API_URL = previous;
});
