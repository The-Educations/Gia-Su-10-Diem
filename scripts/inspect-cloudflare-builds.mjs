// Read-only diagnostics. Never output credentials or build environment values.
const token = process.env.CLOUDFLARE_BUILDS_API_TOKEN;
if (!token) throw new Error('Add the user-scoped CLOUDFLARE_BUILDS_API_TOKEN Actions secret (Workers Builds Configuration: Edit, Workers Scripts: Read).');
const origin = 'https://api.cloudflare.com/client/v4/accounts/1177b93da7312e51a226b6ecffb1e251';
const clean = value => String(value).replaceAll(token, '[redacted]').replace(/cfat_[\w-]+/g, '[redacted]').replace(/[A-Za-z0-9_=-]{32,}/g, '[redacted]');
async function get(path) {
  const response = await fetch(origin + path, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(clean(`${path}: HTTP ${response.status} ${JSON.stringify(body.errors)}`));
  return body.result;
}
const scripts = await get('/workers/scripts');
const worker = scripts.find(script => script.id === 'giasu-diem10');
if (!worker) throw new Error('giasu-diem10 Worker not found.');
const settings = await get(`/builds/workers/${worker.tag}`);
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
  metadata: build.build_trigger_metadata, created_on: build.created_on,
})), null, 2)));
const failed = builds.find(build => build.build_outcome === 'fail' || build.build_outcome === 'failure');
if (failed) {
  const logs = await get(`/builds/builds/${failed.build_uuid}/logs`);
  console.log(clean(JSON.stringify(logs)));
}
