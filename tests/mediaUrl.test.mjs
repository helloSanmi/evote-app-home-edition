import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrl } from '../lib/mediaUrl.js';

test('mediaUrl falls back to default avatar when empty', () => {
  assert.equal(mediaUrl(null), '/avatar.png');
  assert.equal(mediaUrl(''), '/avatar.png');
});

test('mediaUrl returns absolute url untouched', () => {
  const url = 'https://cdn.example.com/photo.jpg';
  assert.equal(mediaUrl(url), url);
});

test('mediaUrl only prefixes base for API uploads', async () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
  const moduleUrl = new URL('../lib/mediaUrl.js', import.meta.url);
  moduleUrl.search = '?case=with-base';
  const { mediaUrl: withBase } = await import(moduleUrl.href);
  assert.equal(withBase('avatar.jpg'), '/avatar.jpg');
  assert.equal(withBase('/avatar.jpg'), '/avatar.jpg');
  assert.equal(withBase('/uploads/x.png'), 'https://api.example.com/uploads/x.png');
  process.env.NEXT_PUBLIC_API_URL = previous;
});
