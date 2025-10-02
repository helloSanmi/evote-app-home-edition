import test from 'node:test';
import assert from 'node:assert/strict';

const importApiBase = async (suffix) => {
  const moduleUrl = new URL('../lib/apiBase.js', import.meta.url);
  moduleUrl.search = `?${suffix}`;
  return import(moduleUrl.href);
};

test('absUrl respects NEXT_PUBLIC_API_URL', async () => {
  const prev = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
  const { absUrl, API_BASE } = await importApiBase('case=env');
  assert.equal(API_BASE, 'https://api.example.com');
  assert.equal(absUrl('relative'), 'https://api.example.com/relative');
  assert.equal(absUrl('/already'), 'https://api.example.com/already');
  process.env.NEXT_PUBLIC_API_URL = prev;
});

test('absUrl leaves external urls untouched', async () => {
  const { absUrl } = await importApiBase('case=absolute');
  assert.equal(absUrl('https://foo.com/x.png'), 'https://foo.com/x.png');
});
