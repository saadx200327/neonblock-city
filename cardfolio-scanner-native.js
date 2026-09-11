/* Cardfolio mobile scanner. A web/PWA cannot invoke Apple's Notes-only document scanner,
   so this provides a scanner-style live camera with a card guide and exact-frame crop. */
(() => {
  'use strict';
  let stream=null, blobUrl='';

  function style(){
    if(document.getElementById('cardfolio-scanner-native-css'))return;
    const s=document.createElement('style');s.id='cardfolio-scanner-native-css';s.textContent=`
    #cardfolioScanner{position:fixed;inset:0;z-index:13000;background:#05070a;color:#fff;display:none;flex-direction:column;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",Segoe UI,sans-serif}#cardfolioScanner.open{display:flex}
    #cardfolioScanner .scan-top{display:flex;align-items:center;justify-content:space-between;padding:max(18px,env(safe-area-inset-top)) 18px 12px;z-index:2}#cardfolioScanner .scan-top strong{font-size:19px;letter-spacing:-.02em}.scan-x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);color:#fff;font-size:24px}.scan-spacer{width:44px}
    #cardfolioScanner .scan-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:#000}#cardfolioScanner video,#cardfolioScanner .scan-preview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.scan-preview{display:none}#cardfolioScanner.preview .scan-preview{display:block}#cardfolioScanner.preview video{display:none}
    #cardfolioScanner .scan-frame{position:absolute;left:10%;right:10%;top:50%;aspect-ratio:5/7;transform:translateY(-50%);border:2px solid rgba(255,255,255,.96);border-radius:22px;box-shadow:0 0 0 999px rgba(0,0,0,.43);pointer-events:none}.scan-frame:before,.scan-frame:after{content:"";position:absolute;width:48px;height:48px;border-color:#4fa0ff;border-style:solid}.scan-frame:before{left:-3px;top:-3px;border-width:4px 0 0 4px;border-radius:21px 0 0 0}.scan-frame:after{right:-3px;bottom:-3px;border-width:0 4px 4px 0;border-radius:0 0 21px 0}
    #cardfolioScanner .scan-hint{position:absolute;left:20px;right:20px;bottom:25px;text-align:center;font-size:14px;font-weight:750;text-shadow:0 2px 10px #000}.scan-status{position:absolute;left:16px;right:16px;top:16px;padding:11px 14px;border-radius:14px;background:rgba(0,0,0,.62);backdrop-filter:blur(14px);font-size:13px;display:none;z-index:3}.scan-status.show{display:block}
    #cardfolioScanner .scan-controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;padding:18px 22px calc(18px + env(safe-area-inset-bottom));background:#05070a}.scan-capture{width:76px;height:76px;border-radius:50%;border:5px solid #fff;background:transparent;box-shadow:inset 0 0 0 6px #05070a,inset 0 0 0 30px #fff;justify-self:center}.scan-secondary{min-height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);color:#fff;font-weight:850;padding:0 15px}.scan-secondary[hidden]{display:block;visibility:hidden}.scan-use{background:#fff;color:#0b1017;border-color:#fff}
    `;document.head.appendChild(s);
  }

  function ui(){
    let el=document.getElementById('cardfolioScanner');if(el)return el;
    el=document.createElement('div');el.id='cardfolioScanner';el.innerHTML=`<div class="scan-top"><button class="scan-x" type="button" aria-label="Close">×</button><strong>Card scanner</strong><span class="scan-spacer"></span></div><div class="scan-stage"><video playsinline autoplay muted></video><img class="scan-preview" alt="Card scan preview"><div class="scan-frame"></div><div class="scan-hint">Center the card inside the frame</div><div class="scan-status"></div></div><div class="scan-controls"><button class="scan-secondary scan-retake" type="button" hidden>Retake</button><button class="scan-capture" type="button" aria-label="Capture"></button><button class="scan-secondary scan-use" type="button" hidden>Use scan</button></div>`;document.body.appendChild(el);
    el.querySelector('.scan-x').addEventListener('click',close);el.querySelector('.scan-capture').addEventListener('click',capture);el.querySelector('.scan-retake').addEventListener('click',retake);el.querySelector('.scan-use').addEventListener('click',use);return el;
  }
  function status(msg=''){const e=document.querySelector('#cardfolioScanner .scan-status');if(!e)return;e.textContent=msg;e.classList.toggle('show',!!msg)}
  function stop(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
  function clearBlob(){if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=''}}
  function close(){stop();clearBlob();const e=document.getElementById('cardfolioScanner');e?.classList.remove('open','preview');if(e)e._blob=null;document.body.style.overflow=''}

  async function open(){
    const el=ui();clearBlob();el._blob=null;el.classList.remove('preview');el.classList.add('open');document.body.style.overflow='hidden';el.querySelector('.scan-capture').hidden=false;el.querySelector('.scan-retake').hidden=true;el.querySelector('.scan-use').hidden=true;status('Hold steady, then capture');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera_api_unavailable');
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}}});const v=el.querySelector('video');v.srcObject=stream;await v.play();status('');
    }catch(err){console.warn('Cardfolio live scanner unavailable',err);status('Opening the device camera…');setTimeout(()=>{close();document.getElementById('cameraInput')?.click()},550)}
  }

  async function capture(){
    const el=document.getElementById('cardfolioScanner'),v=el?.querySelector('video');if(!el||!v||!v.videoWidth||!v.videoHeight)return;
    const stage=el.querySelector('.scan-stage'),frame=el.querySelector('.scan-frame'),sr=stage.getBoundingClientRect(),fr=frame.getBoundingClientRect(),vw=v.videoWidth,vh=v.videoHeight,scale=Math.max(sr.width/vw,sr.height/vh),shownW=vw*scale,shownH=vh*scale,hiddenX=Math.max(0,(shownW-sr.width)/2),hiddenY=Math.max(0,(shownH-sr.height)/2);
    let sx=(fr.left-sr.left+hiddenX)/scale,sy=(fr.top-sr.top+hiddenY)/scale,cw=fr.width/scale,ch=fr.height/scale;sx=Math.max(0,Math.min(vw-1,sx));sy=Math.max(0,Math.min(vh-1,sy));cw=Math.max(1,Math.min(cw,vw-sx));ch=Math.max(1,Math.min(ch,vh-sy));
    const c=document.createElement('canvas');c.width=Math.round(cw);c.height=Math.round(ch);c.getContext('2d').drawImage(v,sx,sy,cw,ch,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));if(!blob)return;stop();clearBlob();blobUrl=URL.createObjectURL(blob);el._blob=blob;el.querySelector('.scan-preview').src=blobUrl;el.classList.add('preview');el.querySelector('.scan-capture').hidden=true;el.querySelector('.scan-retake').hidden=false;el.querySelector('.scan-use').hidden=false;status('');
  }
  async function retake(){const el=document.getElementById('cardfolioScanner');if(!el)return;clearBlob();el._blob=null;await open()}
  async function use(){const el=document.getElementById('cardfolioScanner'),blob=el?._blob;if(!blob)return;const file=new File([blob],`card-scan-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});close();try{if(typeof processCroppedCard==='function')await processCroppedCard({file,meta:{mode:'scanner',ratio:'2.5:3.5',captured_at:new Date().toISOString()}},file);else if(typeof scanFile==='function')await scanFile(file)}catch(err){console.error('Cardfolio scanner processing failed',err);try{toast('Scan processing failed. Try again.')}catch{}}}

  style();
  document.addEventListener('click',e=>{if(!e.target.closest?.('#cameraBtn'))return;e.preventDefault();e.stopImmediatePropagation();void open()},true);
  window.cardfolioOpenScanner=open;
})();
