// Inspection is read-only unless the explicit repair mode is enabled.
// Never output credentials or build environment values.
const token = process.env.CLOUDFLARE_BUILDS_API_TOKEN;
if (!token) throw new Error('Add the user-scoped CLOUDFLARE_BUILDS_API_TOKEN Actions secret (Workers Builds Configuration: Edit, Workers Scripts: Read).');
const origin = 'https://api.cloudflare.com/client/v4/accounts/1177b93da7312e51a226b6ecffb1e251';
const clean = value => String(value).replaceAll(token, '[redacted]').replace(/cfat_[\w-]+/g, '[redacted]').replace(/[A-Za-z0-9_=-]{32,}/g, '[redacted]');
async function request(path, body) {
  const response = await fetch(origin + path, {
    method: body ? 'PATCH' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(clean(`${path}: HTTP ${response.status} ${JSON.stringify(data.errors)}`));
  return data.result;
}
const get = path => request(path);
const scripts = await get('/workers/scripts');
const worker = scripts.find(script => script.id === 'giasu-diem10');
if (!worker) throw new Error('giasu-diem10 Worker not found.');
const path = `/builds/workers/${worker.tag}`;
let settings = await get(path);
if (process.env.REPAIR_CLOUDFLARE_BUILDS === 'true') {
  const repository = settings.git_repository;
  if (repository?.provider_account_name !== 'The-Educations' || repository?.repo_name !== 'Gia-Su-10-Diem') throw new Error('Refusing to change an unexpected repository connection.');
  await request(path, {
    git_repository: {branch: 'cloudflare-production'}, previews_enabled: false,
    production_settings: {
      build_command: 'npm run typecheck && npm test && npm run build:cloudflare',
      deploy_command: 'npx wrangler deploy --durable-objects-code-update-mode immediate',
      root_directory: '/', environment_variables: {NODE_VERSION: {value:'24.13.0',is_secret:false}},
    },
  });
  settings = await get(path);
  if (settings.git_repository?.branch !== 'cloudflare-production' || settings.previews_enabled !== false) throw new Error('Cloudflare did not persist the requested production settings.');
  console.log('Applied CI-gated production settings; unconfigured previews disabled.');
}
const safeSettings = settings => settings && ({
  build_command: settings.build_command, deploy_command: settings.deploy_command,
  root_directory: settings.root_directory, environment_variable_names: Object.keys(settings.environment_variables || {}),
  build_token_uuid: settings.build_token_uuid, path_includes: settings.path_includes, path_excludes: settings.path_excludes,
});
console.log(clean(JSON.stringify({
  git_repository: settings.git_repository, previews_enabled: settings.previews_enabled,
  production_settings: safeSettings(settings.production_settings), previews_base_config: safeSettings(settings.previews_base_config),
}, null, 2)));
const builds = await get(`/builds/workers/${worker.tag}/builds`);
console.log(clean(JSON.stringify(builds.slice(0, 8).map(build => ({
  build_uuid: build.build_uuid, status: build.status, build_outcome: build.build_outcome,
  branch: build.build_trigger_metadata?.branch, created_on: build.created_on,
})), null, 2)));
const requested = process.env.CLOUDFLARE_BUILD_ID;
if (requested && !/^[a-f\d-]{36}$/i.test(requested)) throw new Error('Invalid build UUID.');
const failed = requested || builds.find(build => build.build_outcome === 'fail' || build.build_outcome === 'failure')?.build_uuid;
if (failed) {
  const logs = await get(`/builds/builds/${failed}/logs`);
  console.log(clean(JSON.stringify(logs)));
}
