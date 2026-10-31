// Read-only deployment checks: both hostnames must use the current site and icon.
import assert from 'node:assert/strict';
const canonical = 'https://giasudiem10.online';
const alias = 'https://www.giasudiem10.online';
for (const path of ['/', '/app/auth?role=tutor', '/favicon.ico?favicon.0x3dzn~oxb6tn.ico']) {
  const response = await fetch(alias + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 308, `${alias}${path} must redirect away from the old origin`);
  assert.equal(response.headers.get('location'), canonical + path, 'Redirect must preserve path and query');
}
for (const path of ['/favicon.ico', '/assets/icon-v2.svg', '/apple-touch-icon.png']) {
  const [apex, www] = await Promise.all([canonical, alias].map(origin => fetch(origin + path, { signal: AbortSignal.timeout(15000) })));
  assert.equal(apex.status, 200, path);
  assert.equal(www.status, 200, path);
  assert.equal(new URL(www.url).origin, canonical);
  assert.match(www.headers.get('content-type'), /image/);
  assert.deepEqual(Buffer.from(await www.arrayBuffer()), Buffer.from(await apex.arrayBuffer()), `${path}: both hosts must serve the same brand asset`);
}
const page = await fetch(alias, { signal: AbortSignal.timeout(15000) });
assert.equal(new URL(page.url).origin, canonical);
assert.match(await page.text(), /assets\/icon-v2\.svg/);
console.log('Production routing passed: www redirects preserve paths/queries; both hostnames serve the same current favicon and landing.');
