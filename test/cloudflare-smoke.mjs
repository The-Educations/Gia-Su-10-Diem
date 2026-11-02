import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";
const base=process.env.TEST_ORIGIN || 'http://127.0.0.1:4176';
const messages = new Map();
const mailServer = createServer(async (req, res) => {
 let body = ""; for await (const chunk of req) body += chunk;
 const mail = JSON.parse(body);
 assert.equal(req.url, '/api/v1/send');
 assert.equal(req.headers.authorization, 'Bearer runtime-test-only');
 assert.equal(mail.from, 'contact@giasudiem10.online');
 messages.set(mail.to[0], mail);
 res.writeHead(200, {'Content-Type':'application/json'}); res.end('{}');
});
await new Promise(resolve => mailServer.listen(4180, '127.0.0.1', resolve));
async function verifyEmail(email, cookie) {
 const mail = messages.get(email);
 assert.ok(mail, 'Worker must send a confirmation through Mailflare');
 const token = new URL(mail.text.match(/https?:\/\/[^\s]+/)[0]).hash.slice(7);
 const pending = await fetch(base+'/api/account/onboarding', {method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({step:0,role:'tutor'})});
 assert.equal(pending.status,403);
 const confirm = await fetch(base+'/api/auth/verify-email', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({token})});
 assert.equal(confirm.status,200);
 assert.equal((await confirm.json()).user.email_verified,true);
}
try {
for (const path of ['/', '/app/tutors', '/app/auth', '/app/library']) {
 const page = await fetch(base + path, {redirect: 'manual'});
 assert.equal(page.status, 200, `${path} must serve HTML without asset canonicalization redirects`);
 const html = await page.text();
 assert.ok(path === '/' ? html.includes('learning-journey') : html.includes('id="root"'), path);
}
for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/favicon-32.png', '/assets/brand-icon-20261031.svg', '/assets/brand-icon-20261031.png']) {
 const icon = await fetch(base + path);
 assert.equal(icon.status, 200, path);
 assert.match(icon.headers.get('content-type'), /image/, path);
 assert.equal(icon.headers.get('cache-control'), 'no-cache', path);
}
const email=`cf-${Date.now()}@example.test`;
const res=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Cloudflare test',email,password:'RuntimeTest2026!',role:'tutor'})});
assert.equal(res.status,201,await res.text());
const cookie=res.headers.getSetCookie().find(c=>c.startsWith('giasu_session='))?.split(';')[0];
const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
assert.equal((await get('/api/auth/me')).status,200);
await verifyEmail(email,cookie);
const setup = async (body) => {
 const response = await fetch(base + '/api/account/onboarding', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'}, body:JSON.stringify(body)});
 assert.equal(response.status,200,await response.clone().text());
 return (await response.json()).user;
};
assert.equal((await (await get('/api/auth/me')).json()).user.onboarding_step,0);
assert.equal((await setup({step:0,role:'tutor'})).onboarding_step,1);
assert.equal((await setup({step:1,name:'Cloudflare test',headline:'Gia sư kiểm thử',bio:'Học theo mục tiêu.',education:'Sư phạm Toán',subjects:['toan'],rate:150000,experience:1,location:'Trực tuyến',mode:'online'})).onboarding_step,2);
assert.equal((await setup({step:2})).onboarding_step,3);

const photo=await sharp({create:{width:80,height:80,channels:3,background:'#852f36'}}).png().toBuffer();
for(const [kind,body,type] of [['photo',photo,'image/png'],['banner',photo,'image/png']]){
 const upload=await fetch(base+'/api/tutor/uploads/'+kind,{method:'PUT',headers:{Cookie:cookie,'Content-Type':type,'X-File-Name':kind+'.png'},body});
 assert.equal(upload.status,200,await upload.clone().text());
 const data=await upload.json();const url=data[`${kind}_url`];
 assert.equal((await get(url)).status,200);
 assert.equal((await fetch(base+url)).status,404);
}
const rejectedCv=await fetch(base+'/api/tutor/uploads/cv',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/pdf'},body:'legacy-upload'});
assert.equal(rejectedCv.status,404);
const slot=await fetch(base+'/api/tutor/slots',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({starts_at:new Date(Date.now()+3*86400000).toISOString().slice(0,13)+':00:00.000Z'})});
assert.equal(slot.status,201,await slot.text());
const profile=await(await get('/api/tutor/profile')).json();assert.equal(profile.slots.length,1);
const saved = await fetch(base + '/api/tutor/profile', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...profile, headline:'Gia sư kiểm thử runtime', bio:'Hướng dẫn học sinh theo mục tiêu.', education:'Sư phạm Toán', location:'Hà Nội', subjects:['toan'], teaching_style:'Giải thích bằng hình vẽ.', lesson_plan:'Ôn bài, luyện tập và phản hồi.', profile_theme:'sage',timezone:'Asia/Tokyo',profile_sections:[{title:'Chứng chỉ',body:'Phương pháp giảng dạy'}],education_history:[{level:'university',institution:'Đại học Sư phạm',field:'Toán',start_year:2020,end_year:null}]})});
assert.equal(saved.status,200,await saved.text());
const updated = await(await get('/api/tutor/profile')).json();
assert.equal(updated.profile_theme,'sage');
assert.equal(updated.timezone,'Asia/Tokyo');
assert.equal(updated.education_history[0].institution,'Đại học Sư phạm');
assert.equal(updated.profile_sections[0].title,'Chứng chỉ');
assert.equal(updated.lesson_plan,'Ôn bài, luyện tập và phản hồi.');
assert.equal(updated.status,'pending');

const galleryResponse = await fetch(base+'/api/tutor/gallery', {method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-Caption':encodeURIComponent('Góc học tập')},body:photo});
assert.equal(galleryResponse.status,201,await galleryResponse.clone().text());
const [galleryPhoto] = await galleryResponse.json();
assert.equal((await get(galleryPhoto.url)).status,200);
assert.equal((await fetch(base+galleryPhoto.url)).status,404);
const galleryReload = await(await get('/api/tutor/profile')).json();
assert.equal(galleryReload.gallery[0].caption,'Góc học tập');
const social = await get('/api/gallery/'+galleryPhoto.id+'/social');
assert.equal(social.status,200);
assert.equal((await social.json()).comment_count,0);
assert.equal((await fetch(base+'/api/gallery/'+galleryPhoto.id+'/social')).status,404);
const app=await fetch(base+'/app/',{redirect:'manual'});assert.equal(app.headers.get('location'),base+'/');
console.log('Cloudflare runtime: registration, resumable onboarding, session, portrait/banner upload, private download, availability, custom profile, private gallery and landing routing passed.');

const { verifySeo } = await import('./seo-routing.mjs');
await verifySeo(base);

const parentEmail = `parent-${Date.now()}@example.test`;
const parentResponse = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Parent runtime', email: parentEmail, password: 'RuntimeTest2026!' }) });
assert.equal(parentResponse.status, 201);
const parentCookie = parentResponse.headers.getSetCookie().find(c => c.startsWith('giasu_session='))?.split(';')[0];
await verifyEmail(parentEmail,parentCookie);
const parentSetup = await fetch(base + '/api/account/onboarding', { method: 'PUT', headers: { Cookie: parentCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 0, role: 'parent' }) });
assert.equal(parentSetup.status, 200);
const parentUser = (await parentSetup.json()).user;
assert.equal(parentUser.role, 'student');
assert.equal(parentUser.learner_type, 'parent');
assert.equal((await fetch(base + '/api/posts')).status, 200);
assert.equal((await fetch(base + '/api/admin/posts', { headers: { Cookie: parentCookie } })).status, 403);
const missingPost = await fetch(base + '/app/news/999999999');
assert.equal(missingPost.status, 404);
assert.match(missingPost.headers.get('x-robots-tag'), /noindex/);
console.log('Cloudflare runtime: parent setup, news schema, authorization and missing article SEO passed.');

const community = await fetch(base + '/api/community/posts');
assert.equal(community.status, 200);
assert.equal((await community.json()).rules.kind, 'rules');
const communityWrite = (path, method, data) => fetch(base + '/api/community' + path, { method, headers: { Cookie: parentCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
assert.equal((await communityWrite('/me/display-name', 'PUT', {display_name:'Phụ huynh học tập'})).status, 200);
assert.equal((await communityWrite('/posts', 'POST', {title:'Liên hệ abc.com',body:'Không được đăng'})).status, 400);
const draftResponse = await communityWrite('/posts', 'POST', {title:'Tìm gia sư Anh văn',body:'Con mình cần cải thiện kỹ năng đọc.'});
assert.equal(draftResponse.status, 201);
const draft = await draftResponse.json();
assert.equal(draft.status, 'pending');
assert.equal(draft.author.label, 'Phụ huynh học tập - Phụ huynh');
assert.ok(!JSON.stringify(draft.author).includes('Parent runtime'));
assert.equal((await fetch(base + '/api/community/posts/' + draft.id)).status, 404);
assert.equal((await fetch(base + '/app/community/' + draft.id)).status, 404);
assert.ok(!(await (await fetch(base + '/sitemap.xml')).text()).includes('/app/community/' + draft.id + '</loc>'));
assert.equal((await communityWrite('/posts/' + draft.id, 'PUT', {title:'Tìm gia sư tiếng Anh',body:'Con mình đang học lớp 8.'})).status, 200);
assert.equal((await communityWrite('/posts/' + draft.id, 'DELETE', {})).status, 200);
console.log('Cloudflare community: additive schema, display name, contact filter, pending privacy, edits, deletion and SEO passed.');

} finally { await new Promise(resolve => mailServer.close(resolve)); }
