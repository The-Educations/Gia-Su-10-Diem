const branch = 'cloudflare-production';
const checkName = 'Workers Builds: giasu-diem10';

async function promote(github, context) {
  if (context.ref !== 'refs/heads/main') throw new Error('Only main can deploy.');
  const { data: main } = await github.rest.repos.getBranch({ ...context.repo, branch: 'main' });
  if (main.commit.sha !== context.sha) throw new Error('A newer main commit exists; refusing to promote an older commit.');
  const { data: production } = await github.rest.repos.getBranch({ ...context.repo, branch });
  if (production.commit.sha === context.sha) return 0;
  const checks = await github.paginate(github.rest.checks.listForRef, {
    ...context.repo, ref: context.sha, check_name: checkName, per_page: 100,
  });
  const afterCheckId = Math.max(0, ...checks.map(check => check.id));
  await github.rest.git.updateRef({
    ...context.repo, ref: `heads/${branch}`, sha: context.sha, force: false,
  });
  return afterCheckId;
}

async function waitForBuild(github, context, {
  afterCheckId = 0,
  now = Date.now,
  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const deadline = now() + 10 * 60 * 1000;
  while (now() < deadline) {
    const checks = await github.paginate(github.rest.checks.listForRef, {
      ...context.repo, ref: context.sha, check_name: checkName, per_page: 100,
    });
    const check = checks
      .filter(run => run.id > afterCheckId && run.name === checkName && run.app?.slug === 'cloudflare-workers-and-pages' && run.head_sha === context.sha)
      .sort((a, b) => b.id - a.id)[0];
    if (check?.status === 'completed') {
      if (check.conclusion !== 'success') throw new Error(`Cloudflare build ${check.conclusion}: ${check.details_url}`);
      return check.details_url;
    }
    await sleep(10000);
  }
  throw new Error('Timed out waiting for Workers Builds: giasu-diem10. Check the Cloudflare Git connection and production branch.');
}

module.exports = { promote, waitForBuild };
