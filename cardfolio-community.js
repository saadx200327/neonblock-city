/* Cardfolio Community — social collecting without copying another app's layout.
   Public discovery is backed by Supabase RLS. Private holding data stays private;
   posts store only an explicit public snapshot chosen by the user. */
(function(){
'use strict';
if(window.cardfolioCommunityVersion)return;
window.cardfolioCommunityVersion='20260911-community-1';

const VERSION='20260911-community-1';
const MAX_POSTS=40;
const esc=(value='')=>typeof escapeHtml==='function'?escapeHtml(String(value)):String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let feedMode='discover';
let socialData={posts:[],profiles:new Map(),likes:[],comments:[],following:new Set(),stats:{posts:0,followers:0,following:0}};
let loadSeq=0;

function moneyText(v){
  if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return 'Unpriced';
  try{return typeof money==='function'?money(Number(v)):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v));}
  catch{return `$${Number(v).toFixed(2)}`;}
}
function currentUnitValue(h){
  const candidates=[h?._canonical?.current_price,h?.market_value,h?.manual_value];
  for(const value of candidates)if(value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)))return Number(value);
  return null;
}
function publicCardImage(h){
  const url=String(h?.image_url||'');
  if(!/^https:\/\//i.test(url))return null;
  if(/tvxwzkununcwxiwvrslh\.supabase\.co\/storage/i.test(url))return null;
  if(/[?&](token|signature)=/i.test(url))return null;
  return url.slice(0,1200);
}
function myProfile(){return socialData.profiles.get(state?.user?.id)||null;}
function initials(name='Collector'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'C';}
function relativeTime(value){
  const t=Date.parse(value||'');if(!Number.isFinite(t))return '';
  const diff=Math.max(0,Date.now()-t),m=Math.floor(diff/60000),h=Math.floor(m/60),d=Math.floor(h/24);
  if(m<1)return 'now';if(m<60)return `${m}m`;if(h<24)return `${h}h`;if(d<7)return `${d}d`;
  return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function safeHandle(seed='',uid=''){
  let base=String(seed||'collector').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,18);
  if(base.length<3)base='collector';
  return `${base}_${String(uid).replace(/-/g,'').slice(0,4)}`.slice(0,24);
}
function content(){return document.getElementById('content');}
function signedIn(){return !!(state?.supabase&&state?.user&&state?.backend==='cloud');}

async function ensureSocialProfile(){
  if(!signedIn())return null;
  const uid=state.user.id;
  const {data:existing,error}=await state.supabase.from('social_profiles').select('*').eq('user_id',uid).maybeSingle();
  if(!error&&existing)return existing;
  const email=String(state.user.email||'');
  const display=String(state.user.user_metadata?.full_name||state.user.user_metadata?.name||email.split('@')[0]||'Collector').slice(0,60);
  const row={user_id:uid,handle:safeHandle(email.split('@')[0],uid),display_name:display,bio:''};
  const {data,error:upsertError}=await state.supabase.from('social_profiles').upsert(row,{onConflict:'user_id'}).select('*').single();
  if(upsertError){console.warn('Cardfolio social profile setup deferred',upsertError);return row;}
  return data;
}

function socialShell(){
  const mine=myProfile();
  const composer=signedIn()?`<section class="cf-social-composer">
    <div class="cf-social-composer-head"><strong>Share from your collection</strong><span class="source-tag">Public snapshot</span></div>
    <select id="cfSocialCard" aria-label="Choose a card"><option value="">Choose a card…</option>${(state.holdings||[]).map(h=>`<option value="${esc(h.id)}">${esc(h.display_name||h.subject||'Untitled card')} · ${esc(h.category||'Other')}</option>`).join('')}</select>
    <textarea id="cfSocialCaption" maxlength="500" placeholder="What makes this card worth sharing?"></textarea>
    <div class="cf-social-composer-actions"><span class="cf-social-limit" id="cfSocialLimit">0 / 500</span><button class="btn primary" id="cfSocialPost" type="button">Post</button></div>
  </section>`:`<section class="cf-social-composer"><div class="cf-social-composer-head"><strong>Join the community</strong></div><p class="muted">Browse public posts now. Sign in to share cards, like posts, comment, and follow collectors.</p><button class="btn primary" id="cfSocialSignin" type="button">Sign in</button></section>`;
  return `<div class="cf-social-shell" data-community-version="${VERSION}">
    <div class="cf-social-main">
      <section class="cf-social-hero">
        <div class="cf-social-hero-top"><div><div class="cf-social-kicker">Cardfolio Community</div><h2>Collect together.</h2><p>Share specific cards, compare real collection moves, and follow collectors without exposing your private portfolio.</p></div></div>
        <div class="cf-social-stats"><div class="cf-social-stat"><strong>${socialData.stats.posts||0}</strong><span>Posts</span></div><div class="cf-social-stat"><strong>${socialData.stats.followers||0}</strong><span>Followers</span></div><div class="cf-social-stat"><strong>${socialData.stats.following||0}</strong><span>Following</span></div></div>
        <div class="cf-social-tabs"><button class="cf-social-tab ${feedMode==='discover'?'active':''}" data-social-mode="discover">Discover</button><button class="cf-social-tab ${feedMode==='following'?'active':''}" data-social-mode="following">Following</button></div>
      </section>
      <div id="cfSocialFeed" class="cf-social-feed">${renderFeed()}</div>
    </div>
    <aside class="cf-social-side">${composer}<section class="cf-social-empty"><strong>${mine?`@${esc(mine.handle)}`:'Social is opt-in'}</strong>${mine?'Your posts publish only the card snapshot you choose — not your entire portfolio.':'Private holdings remain private until you explicitly create a social post.'}</section></aside>
  </div>`;
}

function visiblePosts(){
  if(feedMode!=='following'||!state?.user)return socialData.posts;
  return socialData.posts.filter(p=>p.user_id===state.user.id||socialData.following.has(p.user_id));
}
function postComments(postId){return socialData.comments.filter(c=>c.post_id===postId).slice(-3);}
function postLikes(postId){return socialData.likes.filter(l=>l.post_id===postId);}
function profileFor(userId){return socialData.profiles.get(userId)||{display_name:'Collector',handle:'collector'};}
function imageForPost(post){
  const own=(state?.holdings||[]).find(h=>String(h.id)===String(post.holding_id));
  return own?.image_url||post.card_image_url||'';
}
function renderFeed(){
  const posts=visiblePosts();
  if(!posts.length)return `<section class="cf-social-empty"><strong>${feedMode==='following'?'Your following feed is quiet':'No community posts yet'}</strong>${feedMode==='following'?'Follow collectors from Discover and their new posts will appear here.':'Share the first card from your collection.'}</section>`;
  return posts.map(post=>{
    const profile=profileFor(post.user_id),likes=postLikes(post.id),liked=!!state?.user&&likes.some(l=>l.user_id===state.user.id),comments=postComments(post.id),isMe=state?.user?.id===post.user_id,following=socialData.following.has(post.user_id),img=imageForPost(post);
    return `<article class="cf-social-feed-card" data-social-post="${esc(post.id)}">
      <div class="cf-social-post-head"><div class="cf-social-author"><div class="cf-social-avatar">${esc(initials(profile.display_name))}</div><div class="cf-social-author-copy"><strong>${esc(profile.display_name||'Collector')}</strong><small>@${esc(profile.handle||'collector')} · ${esc(relativeTime(post.created_at))}</small></div></div>${!isMe&&signedIn()?`<button class="cf-social-follow ${following?'following':''}" data-social-follow="${esc(post.user_id)}">${following?'Following':'Follow'}</button>`:''}</div>
      <div class="cf-social-card-asset"><div class="cf-social-card-image">${img?`<img src="${esc(img)}" alt="${esc(post.card_name)}" loading="lazy" decoding="async">`:'◇'}</div><div class="cf-social-card-copy"><strong>${esc(post.card_name)}</strong><span>${esc(post.category||'Other')}</span><b>${moneyText(post.value_usd)}</b></div></div>
      ${post.caption?`<p class="cf-social-caption">${esc(post.caption)}</p>`:''}
      <div class="cf-social-actions"><button class="cf-social-action ${liked?'liked':''}" data-social-like="${esc(post.id)}">${liked?'♥':'♡'} ${likes.length}</button><button class="cf-social-action" data-social-focus-comment="${esc(post.id)}">Comment ${socialData.comments.filter(c=>c.post_id===post.id).length||''}</button></div>
      <div class="cf-social-comments">${comments.map(c=>{const cp=profileFor(c.user_id);return `<div class="cf-social-comment"><strong>@${esc(cp.handle||'collector')}</strong>${esc(c.body)}</div>`}).join('')}${signedIn()?`<form class="cf-social-comment-form" data-social-comment-form="${esc(post.id)}"><input class="cf-social-comment-input" maxlength="300" placeholder="Add a comment…" aria-label="Add a comment"><button class="cf-social-comment-send" type="submit">Send</button></form>`:''}</div>
    </article>`;
  }).join('');
}

function setNavActive(){
  document.querySelectorAll('[data-view].active').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('[data-view="social"]').forEach(el=>el.classList.add('active'));
}
function openSocial(){
  try{state.view='social';}catch{}
  setNavActive();
  const title=document.getElementById('viewTitle');if(title)title.textContent='Social';
  const eyebrow=document.getElementById('viewEyebrow');if(eyebrow)eyebrow.textContent='Community intelligence';
  const c=content();if(!c)return;
  c.innerHTML=socialShell();bindSocialEvents();void loadSocialData();
  c.focus?.({preventScroll:true});
}

async function loadSocialData(){
  const seq=++loadSeq;
  if(!state?.supabase){renderSocialFeed();return;}
  try{
    const mine=await ensureSocialProfile();
    const {data:posts,error:postsError}=await state.supabase.from('social_posts').select('id,user_id,holding_id,card_name,category,value_usd,card_image_url,caption,created_at').order('created_at',{ascending:false}).limit(MAX_POSTS);
    if(postsError)throw postsError;
    const postIds=(posts||[]).map(p=>p.id),userIds=[...new Set((posts||[]).map(p=>p.user_id).filter(Boolean))];
    if(mine?.user_id)userIds.push(mine.user_id);
    const profilePromise=userIds.length?state.supabase.from('social_profiles').select('user_id,handle,display_name,avatar_url').in('user_id',[...new Set(userIds)]):Promise.resolve({data:[],error:null});
    const likesPromise=postIds.length?state.supabase.from('social_likes').select('post_id,user_id').in('post_id',postIds):Promise.resolve({data:[],error:null});
    const commentsPromise=postIds.length?state.supabase.from('social_comments').select('id,post_id,user_id,body,created_at').in('post_id',postIds).order('created_at',{ascending:true}).limit(200):Promise.resolve({data:[],error:null});
    const followsPromise=signedIn()?state.supabase.from('social_follows').select('following_id').eq('follower_id',state.user.id):Promise.resolve({data:[],error:null});
    const [profilesRes,likesRes,commentsRes,followsRes]=await Promise.all([profilePromise,likesPromise,commentsPromise,followsPromise]);
    const extraCommentUsers=[...new Set((commentsRes.data||[]).map(c=>c.user_id).filter(id=>id&&!userIds.includes(id)))];
    let extraProfiles=[];
    if(extraCommentUsers.length){const r=await state.supabase.from('social_profiles').select('user_id,handle,display_name,avatar_url').in('user_id',extraCommentUsers);extraProfiles=r.data||[];}
    if(seq!==loadSeq)return;
    socialData.posts=posts||[];
    socialData.profiles=new Map([...(profilesRes.data||[]),...extraProfiles].map(p=>[p.user_id,p]));
    if(mine?.user_id&&!socialData.profiles.has(mine.user_id))socialData.profiles.set(mine.user_id,mine);
    socialData.likes=likesRes.data||[];socialData.comments=commentsRes.data||[];
    socialData.following=new Set((followsRes.data||[]).map(f=>f.following_id));
    if(signedIn()){
      const uid=state.user.id;
      const [postsCount,followersCount,followingCount]=await Promise.all([
        state.supabase.from('social_posts').select('id',{count:'exact',head:true}).eq('user_id',uid),
        state.supabase.from('social_follows').select('follower_id',{count:'exact',head:true}).eq('following_id',uid),
        state.supabase.from('social_follows').select('following_id',{count:'exact',head:true}).eq('follower_id',uid)
      ]);
      socialData.stats={posts:postsCount.count||0,followers:followersCount.count||0,following:followingCount.count||0};
    }else socialData.stats={posts:0,followers:0,following:0};
    if(state?.view==='social')openSocialWithoutReload();
  }catch(error){
    console.warn('Cardfolio Community load deferred',error);
    const feed=document.getElementById('cfSocialFeed');if(feed)feed.innerHTML='<section class="cf-social-empty"><strong>Community is temporarily unavailable</strong>Your private portfolio is unaffected. Try again shortly.</section>';
  }
}
function openSocialWithoutReload(){
  setNavActive();const c=content();if(!c)return;c.innerHTML=socialShell();bindSocialEvents();
}
function renderSocialFeed(){const feed=document.getElementById('cfSocialFeed');if(feed)feed.innerHTML=renderFeed();}

async function createPost(){
  if(!signedIn())return openSignin();
  const select=document.getElementById('cfSocialCard'),caption=document.getElementById('cfSocialCaption'),button=document.getElementById('cfSocialPost');
  const h=(state.holdings||[]).find(x=>String(x.id)===String(select?.value||''));
  if(!h){try{toast('Choose a card to share');}catch{}return;}
  if(button){button.disabled=true;button.textContent='Posting…';}
  try{
    const unit=currentUnitValue(h),value=unit===null?null:unit*Number(h.quantity||1);
    const row={user_id:state.user.id,holding_id:h.id,card_name:String(h.display_name||h.subject||'Untitled card').slice(0,180),category:String(h.category||'Other').slice(0,60),value_usd:value,card_image_url:publicCardImage(h),caption:String(caption?.value||'').trim().slice(0,500)};
    const {error}=await state.supabase.from('social_posts').insert(row);if(error)throw error;
    if(select)select.value='';if(caption)caption.value='';
    try{toast('Shared to Cardfolio Community');}catch{}
    await loadSocialData();
  }catch(error){console.error('Cardfolio social post failed',error);try{toast('Could not publish this post');}catch{}}
  finally{if(button){button.disabled=false;button.textContent='Post';}}
}
async function toggleLike(postId){
  if(!signedIn())return openSignin();
  const liked=socialData.likes.some(l=>l.post_id===postId&&l.user_id===state.user.id);
  try{
    const q=state.supabase.from('social_likes');const {error}=liked?await q.delete().eq('post_id',postId).eq('user_id',state.user.id):await q.insert({post_id:postId,user_id:state.user.id});
    if(error)throw error;await loadSocialData();
  }catch(error){console.warn('Cardfolio like deferred',error);}
}
async function addComment(postId,input){
  if(!signedIn())return openSignin();const body=String(input?.value||'').trim().slice(0,300);if(!body)return;
  try{const {error}=await state.supabase.from('social_comments').insert({post_id:postId,user_id:state.user.id,body});if(error)throw error;input.value='';await loadSocialData();}
  catch(error){console.warn('Cardfolio comment deferred',error);}
}
async function toggleFollow(userId){
  if(!signedIn())return openSignin();if(userId===state.user.id)return;
  const following=socialData.following.has(userId);
  try{const q=state.supabase.from('social_follows');const {error}=following?await q.delete().eq('follower_id',state.user.id).eq('following_id',userId):await q.insert({follower_id:state.user.id,following_id:userId});if(error)throw error;await loadSocialData();}
  catch(error){console.warn('Cardfolio follow deferred',error);}
}
function openSignin(){
  const dialog=document.getElementById('authDialog');if(dialog?.showModal)dialog.showModal();
}
function bindSocialEvents(){
  document.querySelectorAll('[data-social-mode]').forEach(b=>b.addEventListener('click',()=>{feedMode=b.dataset.socialMode==='following'?'following':'discover';openSocialWithoutReload();}));
  document.getElementById('cfSocialPost')?.addEventListener('click',createPost);
  document.getElementById('cfSocialSignin')?.addEventListener('click',openSignin);
  const caption=document.getElementById('cfSocialCaption'),limit=document.getElementById('cfSocialLimit');caption?.addEventListener('input',()=>{if(limit)limit.textContent=`${caption.value.length} / 500`;});
  document.querySelectorAll('[data-social-like]').forEach(b=>b.addEventListener('click',()=>void toggleLike(b.dataset.socialLike)));
  document.querySelectorAll('[data-social-follow]').forEach(b=>b.addEventListener('click',()=>void toggleFollow(b.dataset.socialFollow)));
  document.querySelectorAll('[data-social-focus-comment]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`[data-social-comment-form="${CSS.escape(b.dataset.socialFocusComment)}"] input`)?.focus()));
  document.querySelectorAll('[data-social-comment-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();void addComment(form.dataset.socialCommentForm,form.querySelector('input'));}));
}

function installNavigation(){
  const side=document.querySelector('.side-nav');
  if(side&&!side.querySelector('[data-view="social"]')){
    const b=document.createElement('button');b.dataset.view='social';b.className='nav-item';b.innerHTML='<span>◎</span><span>Social</span>';side.appendChild(b);
  }
  const mobile=document.querySelector('.mobile-nav');
  if(mobile){
    if(!mobile.querySelector('[data-view="social"]')){const b=document.createElement('button');b.dataset.view='social';b.innerHTML='<span>◎</span><small>Social</small>';mobile.appendChild(b);}
    if(!mobile.querySelector('[data-view="profile"]')){const b=document.createElement('button');b.dataset.view='profile';b.innerHTML='<span>○</span><small>Profile</small>';mobile.appendChild(b);}
  }
}
function marketShortcuts(){
  if(state?.view!=='market')return;const c=content();if(!c||c.querySelector('.cf-market-shortcuts'))return;
  const bar=document.createElement('div');bar.className='cf-market-shortcuts';bar.innerHTML='<button class="cf-market-chip" data-view="watchlist">☆ Watchlists</button><button class="cf-market-chip" data-view="portfolio">▦ My cards</button><button class="cf-market-chip" data-view="social">◎ Community</button>';c.prepend(bar);
}
function profileCommunityCard(){
  if(state?.view!=='profile'||!signedIn())return;const c=content();if(!c||c.querySelector('[data-profile-community]'))return;
  const card=document.createElement('section');card.className='panel';card.dataset.profileCommunity='1';card.style.marginTop='16px';card.innerHTML=`<div class="section-head"><div><div class="eyebrow">Community</div><h3>${esc(myProfile()?.display_name||'Your social profile')}</h3></div><button class="btn secondary" data-view="social">Open Social</button></div><div class="metric-strip"><div class="mini-metric"><span class="metric-label">Posts</span><strong>${socialData.stats.posts||0}</strong></div><div class="mini-metric"><span class="metric-label">Followers</span><strong>${socialData.stats.followers||0}</strong></div><div class="mini-metric"><span class="metric-label">Following</span><strong>${socialData.stats.following||0}</strong></div></div>`;c.appendChild(card);
}

/* Capture social navigation before the legacy global data-view click handler, because
   legacy render() intentionally knows only the original views. */
document.addEventListener('click',event=>{
  const social=event.target.closest?.('[data-view="social"]');
  if(!social)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openSocial();
},true);

/* If another layer calls setView('social') directly, make it work too. */
try{
  const baseSetView=typeof setView==='function'?setView:null;
  if(baseSetView)setView=function(view){if(view==='social'){openSocial();return;}const out=baseSetView(view);queueMicrotask(()=>{installNavigation();marketShortcuts();profileCommunityCard();});return out;};
}catch{}

const observer=new MutationObserver(()=>{installNavigation();marketShortcuts();profileCommunityCard();});
observer.observe(document.documentElement,{subtree:true,childList:true});
installNavigation();marketShortcuts();profileCommunityCard();
document.addEventListener('cardfolio:cloud-refreshed',()=>{if(state?.view==='social')void loadSocialData();});
window.cardfolioOpenSocial=openSocial;
})();
