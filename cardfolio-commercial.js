/* Cardfolio commercial hardening — legal consent, account deletion, provider health,
   and market-value integrity. Loaded after all product/interaction layers. */
(function(){
'use strict';
const LEGAL_VERSION='1.0';
const SUPABASE_URL='https://tvxwzkununcwxiwvrslh.supabase.co';
const SUPABASE_KEY='sb_publishable_--j19axhauUMNFXCgUumMA_d1teIy0H';
const CONSENT_KEY=`cardfolio.legal.${LEGAL_VERSION}`;

const terms=`<p><strong>Cardfolio Terms of Use — Version ${LEGAL_VERSION}</strong><br>Effective September 6, 2026</p>
<p>Cardfolio is a collectible-card portfolio, identification and market-intelligence product. By creating an account or continuing after accepting these Terms, you agree to them.</p>
<h3>Accounts and acceptable use</h3><p>You are responsible for your account and information you submit. Do not interfere with the service, attempt to access another user's private data, submit intentionally false market evidence, counterfeit provenance, unlawful content, or malware.</p>
<h3>Your collection content</h3><p>You retain ownership of card photos, notes and collection data you upload. You grant Cardfolio the limited rights needed to host, process, analyze and display that content to you and to derive non-private exact-card identity and market metadata used by the shared catalog.</p>
<h3>Market information</h3><p>Cardfolio values are estimates derived from available evidence. Exact sold observations are prioritized; active asking prices are context and are not represented as completed sales. Cardfolio may leave a card as <strong>Pending Price</strong> when evidence is insufficient.</p>
<h3>No investment advice or certified appraisal</h3><p>Cardfolio is not a broker, investment adviser, grading company, insurer, auctioneer or certified appraiser. Prices, charts and bull/base/bear notes are informational estimates and opinions, not guarantees of resale value or future performance.</p>
<h3>Third-party services</h3><p>Cardfolio may reference marketplaces, grading companies, public APIs and websites. Those services are controlled by their operators and their own terms apply.</p>
<h3>Availability and changes</h3><p>Features and data sources may change. Access may be restricted when necessary for security, abuse prevention, maintenance or legal compliance.</p>
<h3>Account deletion</h3><p>You can request permanent deletion from Profile. This removes your authentication account and private Cardfolio records. Shared non-personal market records may remain.</p>
<h3>Commercial notice</h3><p>Before broad paid distribution, the operator should add its legal business name, support/privacy contact, governing-law terms and jurisdiction-specific notices and obtain appropriate legal review.</p>`;

const privacy=`<p><strong>Cardfolio Privacy Policy — Version ${LEGAL_VERSION}</strong><br>Effective September 6, 2026</p>
<h3>Information you provide</h3><p>Cardfolio processes account information, collection details, quantity, cost basis, acquisition details, notes, grading details, and card photos you choose to save.</p>
<h3>Scan processing</h3><p>Card cropping, supported barcode detection and OCR are designed to run in your browser before a signed-in save uploads the resulting card image to private storage.</p>
<h3>Shared market records</h3><p>Your ownership record remains private to your account. Exact-card identity, market observations, canonical price history and analyst notes may be shared across users who own the same exact card because those records describe the card market, not who owns it.</p>
<h3>Service providers</h3><p>Cardfolio uses Vercel for web hosting and delivery and Supabase for authentication, database services and private card-image storage. Public marketplace and catalog evidence may come from third-party sources when legitimately accessible.</p>
<h3>Use and sharing</h3><p>Information is used to operate accounts, sync collections, identify cards, calculate portfolio values, maintain market history, secure and debug the service, and improve product functionality. Cardfolio does not need to sell personal data to operate the service.</p>
<h3>Security</h3><p>Cardfolio uses per-user database policies, private image storage, HTTPS, and server-only privileges for market-data writes. No internet service can guarantee absolute security.</p>
<h3>Retention and deletion</h3><p>Private account data remains until deleted or retained as required by law. Profile includes an account-deletion control. Shared non-personal market records may remain after account deletion.</p>
<h3>Children and regional rights</h3><p>Cardfolio is not designed as a child-directed service. Before broad commercial distribution, the operator should add applicable age/consent rules, privacy contact information and jurisdiction-specific privacy notices.</p>`;

function text(v=''){return String(v??'').trim()}
function consented(){return localStorage.getItem(CONSENT_KEY)==='accepted'}
function setAuthMessage(msg,bad=false){const n=document.getElementById('authState');if(n){n.textContent=msg||'';n.classList.toggle('bad',!!bad)}}
function ensureLegalUi(){
  if(!document.getElementById('commercialLegalDialog')){
    const d=document.createElement('dialog');d.id='commercialLegalDialog';d.className='modal wide';d.innerHTML='<div class="modal-card"><div class="modal-head"><div><div class="eyebrow">Cardfolio</div><h2 id="commercialLegalTitle">Legal</h2></div><button type="button" class="icon-btn" id="commercialLegalClose" aria-label="Close">×</button></div><div id="commercialLegalBody" class="commercial-legal-body"></div></div>';document.body.appendChild(d);d.querySelector('#commercialLegalClose').addEventListener('click',()=>d.close());
  }
  if(!document.getElementById('commercialStyles')){const s=document.createElement('style');s.id='commercialStyles';s.textContent='.commercial-legal-body{font-size:13px;line-height:1.65;color:#3f4b58}.commercial-legal-body h3{margin-top:24px;color:var(--text)}.commercial-consent{display:flex!important;grid-template-columns:none!important;align-items:flex-start;gap:8px;margin:12px 0;color:var(--muted)!important}.commercial-consent input{width:auto!important;margin-top:2px}.commercial-consent button,.commercial-link{border:0;background:none;padding:0;color:#4e72aa;text-decoration:underline;text-underline-offset:2px;cursor:pointer;font:inherit}.commercial-panel{margin-top:16px}.commercial-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:12px}.commercial-row span{color:var(--muted)}.commercial-row strong{text-align:right}.commercial-danger{margin-top:14px;padding-top:14px;border-top:1px solid rgba(215,74,87,.14)}';document.head.appendChild(s)}
}
function openLegal(which){ensureLegalUi();document.getElementById('commercialLegalTitle').textContent=which==='terms'?'Terms of Use':'Privacy Policy';document.getElementById('commercialLegalBody').innerHTML=which==='terms'?terms:privacy;document.getElementById('commercialLegalDialog').showModal()}
function ensureAuthConsent(){
  const form=document.getElementById('authForm');if(!form||document.getElementById('commercialLegalConsent'))return;
  const row=document.createElement('label');row.className='commercial-consent';row.innerHTML='<input id="commercialLegalConsent" type="checkbox"><span>I agree to the <button type="button" data-commercial-legal="terms">Terms</button> and <button type="button" data-commercial-legal="privacy">Privacy Policy</button>.</span>';
  document.getElementById('authExplainer')?.insertAdjacentElement('afterend',row);row.querySelector('input').checked=consented();row.querySelector('input').addEventListener('change',e=>{if(e.target.checked)localStorage.setItem(CONSENT_KEY,'accepted');else localStorage.removeItem(CONSENT_KEY)});
}
function guardAuth(e){
  const b=e.target.closest?.('#googleLoginBtn,#loginBtn,#signupBtn');if(!b)return;
  ensureAuthConsent();const c=document.getElementById('commercialLegalConsent');if(consented()||c?.checked){localStorage.setItem(CONSENT_KEY,'accepted');return}
  e.preventDefault();e.stopImmediatePropagation();setAuthMessage('Please agree to the Terms and Privacy Policy first.',true);if(typeof toast==='function')toast('Terms and Privacy acceptance required')
}
async function recordConsent(){
  if(!consented()||!globalThis.state?.supabase||!state.user)return;
  const now=new Date().toISOString();const meta=state.user.user_metadata||{};
  const row={id:state.user.id,display_name:meta.full_name||meta.name||state.user.email?.split('@')[0]||null,avatar_url:meta.avatar_url||meta.picture||null,base_currency:'USD',terms_version:LEGAL_VERSION,terms_accepted_at:now,privacy_version:LEGAL_VERSION,privacy_accepted_at:now,updated_at:now};
  try{await state.supabase.from('profiles').upsert(row,{onConflict:'id'})}catch(err){console.warn('Legal acceptance sync deferred',err)}
}
async function providerHealth(){
  try{const r=await fetch(`/api/auth-health?origin=${encodeURIComponent(location.origin)}`,{cache:'no-store'});const j=await r.json();return j}catch{return{enabled:null,message:'Provider status unavailable'}}
}
async function deleteAccount(){
  if(!globalThis.state?.supabase||!state.user)throw new Error('Sign in first.');const {data:{session}}=await state.supabase.auth.getSession();if(!session?.access_token)throw new Error('Session expired. Sign in again.');
  const r=await fetch(`${SUPABASE_URL}/functions/v1/delete-account`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Account deletion failed.');localStorage.removeItem(CONSENT_KEY);try{await state.supabase.auth.signOut({scope:'local'})}catch{};return true
}
function hideManualMarketOverride(){const n=document.getElementById('manualValue');if(n){n.value='';const l=n.closest('label');if(l)l.style.display='none'}}
async function enhanceProfile(){
  if(!globalThis.state||state.view!=='profile')return;const content=document.getElementById('content');if(!content||document.getElementById('commercialPanel'))return;
  const panel=document.createElement('section');panel.id='commercialPanel';panel.className='panel commercial-panel';panel.innerHTML='<div class="section-head"><h3>Privacy, account & hosting</h3></div><div class="commercial-row"><span>Production host</span><strong>Vercel</strong></div><div class="commercial-row"><span>Google sign-in</span><strong id="commercialGoogleHealth">Checking…</strong></div><div class="button-row" style="margin-top:14px;flex-wrap:wrap"><button type="button" class="btn secondary" data-commercial-legal="privacy">Privacy</button><button type="button" class="btn secondary" data-commercial-legal="terms">Terms</button></div><div id="commercialDanger" class="commercial-danger"></div>';content.appendChild(panel);
  const health=await providerHealth();const h=panel.querySelector('#commercialGoogleHealth');if(h){h.textContent=health.enabled===true?'Available':health.enabled===false?'Provider setup required':'Status unavailable';h.className=health.enabled===true?'good':health.enabled===false?'bad':''}
  if(state.user){const dz=panel.querySelector('#commercialDanger');dz.innerHTML='<strong>Delete account</strong><p class="muted" style="font-size:12px;line-height:1.5;margin:6px 0 10px">Permanently removes your account, private holdings and uploaded card images.</p><button type="button" id="commercialDeleteAccount" class="btn danger">Delete my account</button>';dz.querySelector('button').addEventListener('click',async e=>{if(!confirm('Permanently delete your Cardfolio account and private collection data? This cannot be undone.'))return;e.currentTarget.disabled=true;try{await deleteAccount();if(typeof toast==='function')toast('Account deleted');location.replace('/')}catch(err){e.currentTarget.disabled=false;if(typeof toast==='function')toast(text(err?.message)||'Account deletion failed')}})}
}
function install(){
  ensureLegalUi();ensureAuthConsent();hideManualMarketOverride();document.addEventListener('click',guardAuth,true);document.addEventListener('click',e=>{const b=e.target.closest?.('[data-commercial-legal]');if(b){e.preventDefault();e.stopPropagation();openLegal(b.dataset.commercialLegal)}},true);
  if(globalThis.state?.supabase){state.supabase.auth.onAuthStateChange(()=>setTimeout(()=>{recordConsent();enhanceProfile()},0));recordConsent()}
  const observer=new MutationObserver(()=>{hideManualMarketOverride();if(globalThis.state?.view==='profile')enhanceProfile()});observer.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});enhanceProfile();
}
document.addEventListener('DOMContentLoaded',install);
})();
