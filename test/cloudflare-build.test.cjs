const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { promote, waitForBuild } = require('../scripts/cloudflare-build.cjs');
const context = { repo: { owner: 'example', repo: 'app' }, sha: 'current', ref: 'refs/heads/main' };
const build = (overrides = {}) => ({
  id: 1, name: 'Workers Builds: giasu-diem10', head_sha: 'current', status: 'completed', conclusion: 'success',
  app: { slug: 'cloudflare-workers-and-pages' }, details_url: 'https://dash.cloudflare.com/build', ...overrides,
});

test('promotes only the current main commit without force', async () => {
  let updated;
  const github = { rest: {
    repos: { getBranch: async ({branch}) => ({ data: { commit: { sha: branch === 'main' ? 'current' : 'previous' } } }) },
    git: { updateRef: async value => { updated = value; } },
    checks: { listForRef() {} },
  }, paginate: async () => [build({id:9})] };
  assert.equal(await promote(github, context), 9);
  assert.deepEqual(updated, { ...context.repo, ref: 'heads/cloudflare-production', sha: 'current', force: false });
  updated = undefined;
  await assert.rejects(promote(github, { ...context, ref: 'refs/heads/feature' }), /Only main/);
  await assert.rejects(promote(github, { ...context, sha: 'old' }), /newer main/);
  assert.equal(updated, undefined);
});

test('rerunning an already promoted commit reuses its build without a no-op push', async () => {
  const github = { rest: { repos: { getBranch: async () => ({data:{commit:{sha:'current'}}}) } } };
  assert.equal(await promote(github, context), 0);
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

test('promotion ignores earlier preview successes and failures for the same commit', async () => {
  const p = poll([
    [build({id:8}), build({id:9,conclusion:'failure'})],
    [build({id:9,conclusion:'failure'}),build({id:10,status:'in_progress',conclusion:null})],
    [build({id:10})],
  ]);
  assert.equal(await waitForBuild(p.github, context, {...p.clock,afterCheckId:9}), 'https://dash.cloudflare.com/build');
  assert.equal(p.calls(), 3);
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
    repos: { getBranch: async ({branch}) => ({ data: { commit: { sha: branch === 'main' ? 'current' : 'previous' } } }) },
    git: { updateRef: async () => { throw new Error('branch protected'); } },
    checks: { listForRef() {} },
  }, paginate: async () => [] }, context), /branch protected/);
});

function inspectBuilds(fail = false, repair = false, wrongRepo = false) {
  const mock = `let settings = {git_repository:{branch:'main',provider_account_name:'The-Educations',repo_name:${JSON.stringify(wrongRepo?'other':'Gia-Su-10-Diem')}},previews_enabled:true,production_settings:{build_command:'npm run build:cloudflare',environment_variables:{PRIVATE:{value:'must-not-be-printed'}}}};
  globalThis.fetch = async (url, options) => {
    if (options.headers.Authorization !== 'Bearer fixture-builds-token') throw new Error('Missing token');
    let result;
    if (url.endsWith('/workers/scripts')) result = [{id:'other-worker',tag:'other'},{id:'giasu-diem10',tag:'target'}];
    else if (url.endsWith('/builds/workers/target')) {
      if (${fail}) return {ok:false,status:401,json:async()=>({success:false,errors:[{message:'Invalid token fixture-builds-token'}]})};
      if (options.method === 'PATCH') {
        const patch = JSON.parse(options.body);
        if (patch.git_repository.branch !== 'cloudflare-production' || patch.previews_enabled !== false || patch.production_settings.environment_variables.NODE_VERSION.value !== '24.13.0') throw new Error('Unsafe settings');
        if (JSON.stringify(patch).includes('build_token')) throw new Error('Must preserve the build token');
        settings = {...settings,...patch};
      }
      result = settings;
    } else if (url.endsWith('/builds/workers/target/builds')) result = [{build_uuid:'failed',build_outcome:'failure'}];
    else if (url.endsWith('/builds/builds/failed/logs')) result = {lines:['Deploy error fixture-builds-token cfat_otherprivatecredential1234567890']};
    else throw new Error('Unexpected endpoint');
    return {ok:true,status:200,json:async()=>({success:true,result})};
  }`;
  return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`, resolve(__dirname, '../scripts/inspect-cloudflare-builds.mjs')], {
    encoding:'utf8', env:{...process.env,CLOUDFLARE_BUILDS_API_TOKEN:'fixture-builds-token',REPAIR_CLOUDFLARE_BUILDS:String(repair),CLOUDFLARE_BUILD_ID:''},
  });
}

test('native diagnostics target this Worker and redact credentials and environment values', () => {
  const result = inspectBuilds();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"branch": "main"/);
  assert.match(result.stdout, /Deploy error/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-builds-token|cfat_otherprivate|must-not-be-printed/);
});

test('native diagnostics fail visibly on an incompatible token without exposing it', () => {
  const result = inspectBuilds(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HTTP 401/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-builds-token/);
});

test('repair keeps deployment credentials and selects the CI-gated production branch', () => {
  const result = inspectBuilds(false, true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Applied CI-gated production settings/);
  assert.match(result.stdout, /"previews_enabled": false/);
});

test('repair refuses a different repository connection', () => {
  const result = inspectBuilds(false, true, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected repository/);
});
