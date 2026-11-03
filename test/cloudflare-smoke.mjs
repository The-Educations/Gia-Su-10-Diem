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
 const code = mail.text.match(/: (\d{6})/)[1];
 const pending = await fetch(base+'/api/account/onboarding', {method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({step:0,role:'tutor'})});
 assert.equal(pending.status,401);
 const confirm = await fetch(base+'/api/auth/signup/verify', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({code})});
 assert.equal(confirm.status,201);
 assert.equal((await confirm.json()).user.email_verified,true);
 return confirm.headers.getSetCookie().find(c=>c.startsWith("giasu_session="))?.split(";")[0];
}
try {
for (const path of ['/', '/app/tutors', '/app/auth', '/app/library', '/app/calendar', '/app/offers']) {
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
assert.equal(res.status,202,await res.text());
const pendingCookie=res.headers.getSetCookie().find(c=>c.startsWith('giasu_signup='))?.split(';')[0];
const cookie = await verifyEmail(email,pendingCookie);
const get=path=>fetch(base+path,{headers:{Cookie:cookie}});
assert.equal((await get('/api/auth/me')).status,200);
const calendarStatus = await get('/api/account/google-calendar');
assert.equal(calendarStatus.status,200);
assert.deepEqual(await calendarStatus.json(), {available:false,connected:false,email:'',lastSynced:null,error:'',calendarUrl:''});
assert.equal((await fetch(base+'/api/account/google-calendar')).status,401);
assert.deepEqual(await (await get('/api/offers')).json(), []);
assert.equal((await fetch(base+'/api/offers')).status,401);
const supportThread = (await (await get('/api/support')).json())[0];
assert.equal((await (await get('/api/support')).json())[0].id, supportThread.id);
const supportMessage = await fetch(base+`/api/support/${supportThread.id}/messages`, {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({body:'Runtime support request'})});
assert.equal(supportMessage.status,201);
assert.equal((await (await get(`/api/support/${supportThread.id}/messages`)).json())[0].body,'Runtime support request');
const voiceData = Buffer.alloc(48); voiceData.write('RIFF'); voiceData.write('WAVE',8);
const voiceUpload = await fetch(base+`/api/chat/support/${supportThread.id}/attachments`, {method:'POST',headers:{Cookie:cookie,'Content-Type':'audio/wav'},body:voiceData});
assert.equal(voiceUpload.status,201);
const voiceAttachment = await voiceUpload.json();
assert.equal((await fetch(base+`/api/support/${supportThread.id}/messages`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({attachment_id:voiceAttachment.id})})).status,201);
assert.equal((await (await get(`/api/support/${supportThread.id}/messages`)).json()).at(-1).attachment.id,voiceAttachment.id);
assert.equal((await fetch(base+voiceAttachment.url)).status,401);
const voiceRange = await fetch(base+voiceAttachment.url,{headers:{Cookie:cookie,Range:'bytes=0-9'}});
assert.equal(voiceRange.status,206);
assert.equal((await voiceRange.arrayBuffer()).byteLength,10);

assert.equal((await fetch(base+'/api/admin/users/1',{method:'DELETE',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test'})})).status,403);

const setup = async (body) => {
 const response = await fetch(base + '/api/account/onboarding', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'}, body:JSON.stringify(body)});
 assert.equal(response.status,200,await response.clone().text());
 return (await response.json()).user;
};
assert.equal((await (await get('/api/auth/me')).json()).user.onboarding_step,0);
assert.equal((await setup({step:0,role:'tutor'})).onboarding_step,1);
assert.equal((await setup({step:1,display_name:'Bạn học Cloudflare',name:'Cloudflare test',headline:'Gia sư kiểm thử',bio:'Học theo mục tiêu.',education:'Sư phạm Toán',subjects:['toan'],rate:150000,experience:1,location:'Trực tuyến',mode:'online'})).onboarding_step,3);

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
const weeklyResponse = await fetch(base+'/api/tutor/availability', {method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:0,blocks:[{weekday:0,hour:0}]})});
assert.equal(weeklyResponse.status,200,await weeklyResponse.clone().text());
const weeklyProfile = await(await get('/api/tutor/profile')).json();
assert.equal(weeklyProfile.weekly_schedule.revision,1);
assert.ok(weeklyProfile.slots.filter(s=>s.source==='weekly').length>=7);
assert.ok(weeklyProfile.slots.filter(s=>s.source==='weekly').every(s=>s.duration_minutes===60));
assert.equal(weeklyProfile.slots.find(s=>s.source==='manual').duration_minutes,60);
const staleSchedule = await fetch(base+'/api/tutor/availability', {method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:0,blocks:[]})});
assert.equal(staleSchedule.status,409);
const saved = await fetch(base + '/api/tutor/profile', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...profile, province_code:'1',ward_code:'4',availability:{revision:1,blocks:[{weekday:1,hour:18}]}, headline:'Gia sư kiểm thử runtime', bio:'Hướng dẫn học sinh theo mục tiêu.', education:'Sư phạm Toán', location:'Hà Nội', subjects:['toan'], teaching_style:'Giải thích bằng hình vẽ.', lesson_plan:'Ôn bài, luyện tập và phản hồi.', profile_theme:'paper',timezone:'Asia/Tokyo',profile_sections:[{title:'Chứng chỉ',body:'Phương pháp giảng dạy'}],education_history:[{level:'university',institution:'Đại học Sư phạm',field:'Toán',start_year:2020,end_year:null}]})});
assert.equal(saved.status,200,await saved.text());
const updated = await(await get('/api/tutor/profile')).json();
assert.equal(updated.profile_theme,'paper');
assert.equal(updated.timezone,'Asia/Tokyo');
assert.equal(updated.education_history[0].institution,'Đại học Sư phạm');
assert.equal(updated.profile_sections[0].title,'Chứng chỉ');
assert.equal(updated.lesson_plan,'Ôn bài, luyện tập và phản hồi.');
assert.equal(updated.status,'pending');
assert.equal(updated.location,'Phường Ba Đình, Thành phố Hà Nội');
assert.deepEqual(updated.weekly_schedule,{revision:2,blocks:[{weekday:1,hour:18}]});
assert.deepEqual(updated.theme_inventory.map(t => t.id), ['paper']);
const unowned = await fetch(base+'/api/tutor/theme', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({theme:'sage'})});
assert.equal(unowned.status,403);
const defaultTheme = await fetch(base+'/api/tutor/theme', {method:'PUT', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({theme:'paper'})});
assert.equal(defaultTheme.status,200);

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
assert.equal(parentResponse.status, 202);
const parentPending = parentResponse.headers.getSetCookie().find(c => c.startsWith('giasu_signup='))?.split(';')[0];
const parentCookie = await verifyEmail(parentEmail,parentPending);
assert.equal((await fetch(base+`/api/support/${supportThread.id}/messages`,{headers:{Cookie:parentCookie}})).status,404);
const parentSetup = await fetch(base + '/api/account/onboarding', { method: 'PUT', headers: { Cookie: parentCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 0, role: 'parent' }) });
assert.equal(parentSetup.status, 200);
const parentUser = (await parentSetup.json()).user;
assert.equal(parentUser.role, 'student');
assert.equal(parentUser.learner_type, 'parent');
for (const data of [{step:1,display_name:'Phụ huynh học tập',name:'Parent runtime',goal:'Help my child study Math',school:'THCS Ba Đình',province_code:'1',ward_code:'4'}]) {
 const response = await fetch(base+'/api/account/onboarding', {method:'PUT',headers:{Cookie:parentCookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal(response.status,200);
}
const learnerBlocks = [{weekday:1,hour:19},{weekday:6,hour:23}];
const learnerSave = body => fetch(base+'/api/account/availability', {method:'PUT',headers:{Cookie:parentCookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await learnerSave({revision:0,blocks:learnerBlocks})).status,200);
assert.equal((await learnerSave({revision:0,blocks:[]})).status,409);
const learnerSchedule = await fetch(base+'/api/account/availability', {headers:{Cookie:parentCookie}});
assert.deepEqual(await learnerSchedule.json(),{revision:1,blocks:learnerBlocks});
assert.equal((await get('/api/account/availability')).status,403);
assert.equal((await fetch(base+'/api/account/availability')).status,401);
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
const uploadImage = await fetch(base + '/api/community/images', {method:'POST', headers:{Cookie:parentCookie,'Content-Type':'image/png'}, body:photo});
assert.equal(uploadImage.status,201,await uploadImage.clone().text());
const imageUrl = (await uploadImage.json()).url;
assert.equal((await fetch(base+imageUrl)).status,404);
assert.equal((await fetch(base+imageUrl,{headers:{Cookie:parentCookie}})).status,200);
const savedResponse = await communityWrite('/drafts', 'POST', {body_html:`<p><strong>Con mình cần cải thiện kỹ năng đọc.</strong><a href="https://example.org">Tài liệu</a></p><img src="${imageUrl}" alt="Bài học"><script>alert(1)</script>`});
assert.equal(savedResponse.status,201);
const savedDraft = await savedResponse.json();
assert.equal(savedDraft.title,'');
assert.equal((await fetch(base + '/api/community/drafts/' + savedDraft.id)).status,401);
assert.equal((await fetch(base + '/api/community/drafts/' + savedDraft.id,{headers:{Cookie:parentCookie}})).status,200);
assert.equal((await fetch(base + '/app/community/write?draft=' + savedDraft.id)).status,200);
assert.equal((await communityWrite('/drafts/' + savedDraft.id,'PUT',{title:'Tìm gia sư Anh văn',body_html:savedDraft.body_html,version:1})).status,200);
assert.equal((await communityWrite('/drafts/' + savedDraft.id,'PUT',{version:1})).status,409);
const draftResponse = await communityWrite('/posts', 'POST', {title:'Tìm gia sư Anh văn',body_html:savedDraft.body_html,draft_id:savedDraft.id,draft_version:2});
assert.equal((await fetch(base + '/api/community/drafts/' + savedDraft.id,{headers:{Cookie:parentCookie}})).status,404);
assert.equal(draftResponse.status, 201);
const draft = await draftResponse.json();
assert.equal(draft.status, 'pending');
assert.match(draft.body_html, /<strong>/);
assert.doesNotMatch(draft.body_html, /script/);
assert.equal(draft.author.label, 'Phụ huynh học tập - Phụ huynh');
assert.ok(!JSON.stringify(draft.author).includes('Parent runtime'));
assert.equal((await fetch(base + '/api/community/posts/' + draft.id)).status, 404);
assert.equal((await fetch(base + '/app/community/' + draft.id)).status, 404);
assert.ok(!(await (await fetch(base + '/sitemap.xml')).text()).includes('/app/community/' + draft.id + '</loc>'));
assert.equal((await communityWrite('/posts/' + draft.id, 'PUT', {title:'Tìm gia sư tiếng Anh',body:'Con mình đang học lớp 8.'})).status, 200);
assert.equal((await communityWrite('/posts/' + draft.id, 'DELETE', {})).status, 200);
const member = (await (await get('/api/community/me')).json()).author;
assert.match(member.profile_code, /^[a-z2-9]{8}$/);
const memberPath = '/api/community/members/' + member.profile_code;
assert.equal((await fetch(base + memberPath)).status, 401);
assert.equal((await get(memberPath)).status, 200);
const memberHtml = await fetch(base + '/app/community/members/' + member.profile_code);
assert.equal(memberHtml.status, 200);
const memberShell = await memberHtml.text();
assert.match(memberShell, /noindex/); assert.ok(!memberShell.includes('og:image')); assert.ok(!memberShell.includes('application/ld+json'));
for (const kind of ['avatar', 'cover']) {
 const uploaded = await fetch(base+'/api/community/me/'+kind,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'image/png'},body:photo});
 assert.equal(uploaded.status,200,await uploaded.clone().text());
 assert.equal((await fetch(base+memberPath+'/'+kind)).status,401);
 const image = await get(memberPath+'/'+kind); assert.equal(image.status,200); assert.match(image.headers.get('cache-control'),/private/);
 const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
 assert.equal(meta.width,kind==='avatar'?640:1280); assert.equal(meta.height,kind==='avatar'?640:320);
}
assert.ok(!(await (await fetch(base+'/sitemap.xml')).text()).includes('/community/members/'));
console.log('Cloudflare community: additive schema, display name, contact filter, pending privacy, edits, deletion and SEO passed.');

} finally { await new Promise(resolve => mailServer.close(resolve)); }
