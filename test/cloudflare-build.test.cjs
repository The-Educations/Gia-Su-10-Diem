const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promote, waitForBuild } = require('../scripts/cloudflare-build.cjs');
const context = { repo: { owner: 'example', repo: 'app' }, sha: 'current', ref: 'refs/heads/main' };
const build = (overrides = {}) => ({
  id: 1, name: 'Workers Builds: giasu-diem10', head_sha: 'current', status: 'completed', conclusion: 'success',
  app: { slug: 'cloudflare-workers-and-pages' }, details_url: 'https://dash.cloudflare.com/build', ...overrides,
});

test('promotes only the current main commit without force', async () => {
  let updated;
  const github = { rest: {
    repos: { getBranch: async () => ({ data: { commit: { sha: 'current' } } }) },
    git: { updateRef: async value => { updated = value; } },
  } };
  await promote(github, context);
  assert.deepEqual(updated, { ...context.repo, ref: 'heads/cloudflare-production', sha: 'current', force: false });
  updated = undefined;
  await assert.rejects(promote(github, { ...context, ref: 'refs/heads/feature' }), /Only main/);
  await assert.rejects(promote(github, { ...context, sha: 'old' }), /newer main/);
  assert.equal(updated, undefined);
});

function poll(batches) {
  let time = 0, calls = 0;
  return {
    github: {
      rest: { checks: { listForRef() {} } },
      paginate: async (_, options) => {
        assert.equal(options.ref, 'current');
        assert.equal(options.check_name, 'Workers Builds: giasu-diem10');
        return batches[Math.min(calls++, batches.length - 1)];
      },
    },
    clock: { now: () => time, sleep: async ms => { time += ms; } },
    calls: () => calls,
  };
}

test('waits for the newest matching Cloudflare check, ignoring other apps, workers and commits', async () => {
  const p = poll([
    [build(), build({ id: 2, status: 'in_progress', conclusion: null })],
    [build({ id: 2 }), build({ id: 3, head_sha: 'old', conclusion: 'failure' }),
      build({ id: 4, app: { slug: 'github-actions' }, conclusion: 'failure' }),
      build({ id: 5, name: 'Workers Builds: another-worker', conclusion: 'failure' })],
  ]);
  assert.equal(await waitForBuild(p.github, context, p.clock), 'https://dash.cloudflare.com/build');
  assert.equal(p.calls(), 2);
});

for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral']) {
  test(`rejects a ${conclusion} build instead of claiming deployment success`, async () => {
    const p = poll([[build({ conclusion })]]);
    await assert.rejects(waitForBuild(p.github, context, p.clock), /Cloudflare build/);
  });
}
for (const checks of [[], [build({ status: 'in_progress', conclusion: null })]]) {
  test('times out when no successful Cloudflare build arrives', async () => {
    const p = poll([checks]);
    await assert.rejects(waitForBuild(p.github, context, p.clock), /Timed out/);
    assert.equal(p.calls(), 60);
  });
}
test('surfaces GitHub API and branch promotion errors', async () => {
  const p = poll([]);
  p.github.paginate = async () => { throw new Error('API unavailable'); };
  await assert.rejects(waitForBuild(p.github, context, p.clock), /API unavailable/);
  await assert.rejects(promote({ rest: {
    repos: { getBranch: async () => ({ data: { commit: { sha: 'current' } } }) },
    git: { updateRef: async () => { throw new Error('branch protected'); } },
  } }, context), /branch protected/);
});
