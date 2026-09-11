'use strict';
const fs=require('fs');
const assert=require('assert');
const index=fs.readFileSync('index.html','utf8');
const critical=fs.readFileSync('cardfolio-critical-fixes.js','utf8');
const live=fs.readFileSync('cardfolio-live-sync.js','utf8');

const proxyScripts=[...index.matchAll(/<script[^>]+src="\/api\/proxy\?path=/g)];
assert(proxyScripts.length<=4,`startup proxy budget exceeded: ${proxyScripts.length}`);
for(const noncritical of ['cardfolio-home-ux.js','cardfolio-live-sync.js','cardfolio-market-integrity.js','cardfolio-chart-daily-average.js','cardfolio-marketplace-ui.js','cardfolio-watchlists-v2.js','cardfolio-watchlists-ios-guard.js']){
  assert(!index.includes(`path=${noncritical}`),`${noncritical} must not block initial render`);
}
for(const required of ['cardfolio-identity-persistence.js','cardfolio-exact-identity-client.js','cardfolio-production-guard.js','cardfolio-save-stack-guard.js']){
  assert(index.includes(`path=${required}`),`${required} must remain startup-protected`);
}
assert(critical.includes('const RECENT_MS=72*60*60*1000'),'Recently Added must expire at 72 hours');
assert(critical.includes("card.remove()"),'Recently Added removes cards only from the rendered recent grid');
assert(!/state\.holdings\s*=\s*\(state\?\.holdings.*RECENT_MS/.test(critical),'Recent expiry must not delete holdings');
assert(critical.includes(".category-bubble[data-open-category]"),'Home categories must be intercepted');
assert(critical.includes('e.stopImmediatePropagation()'),'Home category navigation race must be blocked in capture phase');
assert(critical.includes("b.removeAttribute('data-view')"),'Home categories must not retain portfolio navigation');
assert(critical.includes("portfolio:'Portfolio'"),'Portfolio title must be explicit');
assert(critical.includes("watchlist:'Watchlist'"),'Watchlist title must be explicit');
assert(critical.includes('navigator.mediaDevices?.getUserMedia'),'Open Camera must use the live rear-camera scanner when available');
assert(critical.includes("facingMode:{ideal:'environment'}"),'Scanner must request the rear camera');
assert(critical.includes("mode:'scanner'"),'Scanner output must continue through Cardfolio crop/scan processing');
assert(critical.includes("const LOCALES={en:{label:'English'"),'English must be supported');
assert(critical.includes("es:{label:'Español'"),'Spanish must be supported');
assert(critical.includes("bn:{label:'বাংলা'"),'Bengali must be supported');
assert(critical.includes("localStorage.setItem(LOCALE_KEY"),'UI language must persist');
assert(critical.includes("tr('Card language')"),'Exact card language must be preserved separately from app language');
assert(critical.includes("loadProxy('cardfolio-market-experience.js'"),'Card detail must lazy-load active market listings');
assert(critical.includes("loadProxy('cardfolio-market-live-ui.js'"),'Active listings must receive distinct presentation');
assert(critical.includes("loadProxy('cardfolio-chart-daily-average.js'"),'Daily-average chart protection must load with market detail');
assert(live.includes('const changed=before!==fingerprint()'),'Background refresh must avoid unnecessary rerenders');
assert(!live.includes('cardfolio-scanner-native.js'),'Background sync must not own scanner loading');
assert(!live.includes('cardfolio-locale.js'),'Background sync must not own locale loading');
console.log('Cardfolio requested UX contract OK');
