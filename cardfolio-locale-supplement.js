/* Cardfolio locale supplement.
   Loaded only after a non-English locale is selected (or restored) so translation
   coverage does not add work to the normal English startup path. Exact card names,
   identities and marketplace titles remain untouched. */
(() => {
  'use strict';
  if (window.cardfolioLocaleSupplement) return;

  const KEY='cardfolio.locale.v2';
  const baseText=new WeakMap();
  let locale=localStorage.getItem(KEY)||'en';
  let queued=false;

  const STRINGS={
    es:{
      'Take or choose a photo, crop the exact card, then Cardfolio reads visible details on-device. You confirm the identity before saving.':'Toma o elige una foto, recorta exactamente la tarjeta y Cardfolio leerá los detalles visibles en el dispositivo. Confirma la identidad antes de guardarla.',
      'Search player, set, card #...':'Buscar jugador, set, tarjeta #...',
      'Search player, set, card #…':'Buscar jugador, set, tarjeta #…',
      'Search a card':'Buscar una tarjeta','Holdings':'Posiciones','holdings':'posiciones','cards':'tarjetas','priced':'con precio','pending':'pendientes','per card':'por tarjeta',
      'Fair market value':'Valor justo de mercado','Market range':'Rango de mercado','Quick sale':'Venta rápida','Suggested list':'Precio sugerido','Exact comps':'Comparables exactos','Sales · 30d':'Ventas · 30d','Last exact sale':'Última venta exacta','Liquidity':'Liquidez','Last market check':'Última revisión de mercado','Accepted-sale sources':'Fuentes de ventas aceptadas','No exact sold source accepted yet':'Aún no hay una fuente de venta exacta aceptada',
      'Live marketplace':'Mercado en vivo','Active eBay listings':'Anuncios activos de eBay','Browse here · open eBay only when you choose':'Explora aquí · abre eBay solo cuando quieras','Active asking prices are marketplace context only. They never set Cardfolio FMV or sold history.':'Los precios solicitados activos son solo contexto del mercado. Nunca determinan el valor de Cardfolio ni el historial de ventas.','SEARCH eBay':'BUSCAR EN eBay','COPY CARD':'COPIAR TARJETA',
      'No active eBay listings matched this card search right now.':'No hay anuncios activos de eBay que coincidan con esta tarjeta ahora mismo.','Live eBay listings could not be loaded right now.':'No se pudieron cargar los anuncios activos de eBay ahora mismo.','eBay live listings are unavailable on this deployment right now.':'Los anuncios activos de eBay no están disponibles en este despliegue ahora mismo.',
      'More exact sold evidence is needed.':'Se necesitan más ventas exactas verificadas.','Queued for hourly market research.':'En cola para investigación de mercado por hora.','No verified exact sold observations are available yet.':'Aún no hay ventas exactas verificadas disponibles.','verified sale':'venta verificada','verified sales':'ventas verificadas',
      'Account':'Cuenta','Your Cardfolio':'Tu Cardfolio','Sync your portfolio':'Sincroniza tu portafolio','Market engine':'Motor de mercado','Hourly research':'Investigación por hora','Shared assets':'Activos compartidos','Snapshots':'Instantáneas','Local Vault':'Bóveda local',
      'Cloud sync':'Sincronización en la nube','Sign in to Cardfolio':'Inicia sesión en Cardfolio','Email':'Correo electrónico','Password':'Contraseña','Create account':'Crear cuenta','Continue with Google':'Continuar con Google','or use email':'o usa correo electrónico',
      'Holding':'Posición','Save holding':'Guardar posición','Delete':'Eliminar','Notes':'Notas','Category':'Categoría','Display name':'Nombre visible','Subset / insert':'Subconjunto / inserto','Image variation':'Variación de imagen','Serial number':'Número de serie','Team / club':'Equipo / club','Condition':'Condición','Quantity':'Cantidad','Cost basis / card ($)':'Costo base / tarjeta ($)','Acquired from':'Adquirida en','Acquisition date':'Fecha de adquisición','Manual value ($)':'Valor manual ($)','Grading company':'Empresa de graduación','Certification #':'Certificación #','Rookie / RC':'Novato / RC','Autograph':'Autógrafo','Relic / memorabilia':'Reliquia / memorabilia',
      'Confirm card details':'Confirmar detalles de la tarjeta','Review before add':'Revisar antes de agregar','Confirm scan':'Confirmar escaneo','OCR confidence':'Confianza de OCR','Match with TCGdex':'Comparar con TCGdex','Use extracted fields':'Usar campos extraídos','Preparing crop…':'Preparando recorte…','Saving your card…':'Guardando tu tarjeta…',
      'Only Cardfolio interfaces with maintained translations are offered. Card names and marketplace titles are never machine-translated.':'Solo se ofrecen interfaces de Cardfolio con traducciones mantenidas. Los nombres de tarjetas y títulos de anuncios nunca se traducen automáticamente.'
    },
    bn:{
      'Take or choose a photo, crop the exact card, then Cardfolio reads visible details on-device. You confirm the identity before saving.':'ছবি তুলুন বা বেছে নিন, ঠিক কার্ডটি ক্রপ করুন, তারপর Cardfolio ডিভাইসেই দৃশ্যমান তথ্য পড়বে। সংরক্ষণের আগে পরিচয় নিশ্চিত করুন।',
      'Search player, set, card #...':'প্লেয়ার, সেট, কার্ড # খুঁজুন...','Search player, set, card #…':'প্লেয়ার, সেট, কার্ড # খুঁজুন…','Search a card':'কার্ড খুঁজুন','Holdings':'হোল্ডিংস','holdings':'হোল্ডিংস','cards':'কার্ড','priced':'দামযুক্ত','pending':'অপেক্ষমাণ','per card':'প্রতি কার্ড',
      'Fair market value':'ন্যায্য বাজারমূল্য','Market range':'বাজার রেঞ্জ','Quick sale':'দ্রুত বিক্রি','Suggested list':'প্রস্তাবিত লিস্ট','Exact comps':'সঠিক কম্প','Sales · 30d':'বিক্রি · ৩০ দিন','Last exact sale':'সর্বশেষ সঠিক বিক্রি','Liquidity':'তারল্য','Last market check':'সর্বশেষ বাজার যাচাই','Accepted-sale sources':'গৃহীত বিক্রির উৎস','No exact sold source accepted yet':'এখনও কোনো সঠিক বিক্রির উৎস গৃহীত হয়নি',
      'Live marketplace':'লাইভ মার্কেটপ্লেস','Active eBay listings':'সক্রিয় eBay লিস্টিং','Browse here · open eBay only when you choose':'এখানে দেখুন · চাইলে তবেই eBay খুলুন','Active asking prices are marketplace context only. They never set Cardfolio FMV or sold history.':'সক্রিয় চাওয়া দাম শুধু মার্কেটপ্লেস প্রসঙ্গ। এগুলো কখনো Cardfolio FMV বা বিক্রির ইতিহাস নির্ধারণ করে না।','SEARCH eBay':'eBay খুঁজুন','COPY CARD':'কার্ড কপি',
      'No active eBay listings matched this card search right now.':'এই কার্ডের সাথে মেলা সক্রিয় eBay লিস্টিং এখন নেই।','Live eBay listings could not be loaded right now.':'লাইভ eBay লিস্টিং এখন লোড করা যায়নি।','eBay live listings are unavailable on this deployment right now.':'এই ডিপ্লয়মেন্টে লাইভ eBay লিস্টিং এখন উপলভ্য নয়।',
      'More exact sold evidence is needed.':'আরও সঠিক বিক্রির প্রমাণ দরকার।','Queued for hourly market research.':'প্রতি ঘণ্টার বাজার গবেষণার কিউতে আছে।','No verified exact sold observations are available yet.':'এখনও যাচাইকৃত সঠিক বিক্রির তথ্য নেই।','verified sale':'যাচাইকৃত বিক্রি','verified sales':'যাচাইকৃত বিক্রি',
      'Account':'অ্যাকাউন্ট','Your Cardfolio':'আপনার Cardfolio','Sync your portfolio':'আপনার পোর্টফোলিও সিঙ্ক করুন','Market engine':'মার্কেট ইঞ্জিন','Hourly research':'প্রতি ঘণ্টার গবেষণা','Shared assets':'শেয়ার্ড অ্যাসেট','Snapshots':'স্ন্যাপশট','Local Vault':'লোকাল ভল্ট',
      'Cloud sync':'ক্লাউড সিঙ্ক','Sign in to Cardfolio':'Cardfolio-তে সাইন ইন করুন','Email':'ইমেইল','Password':'পাসওয়ার্ড','Create account':'অ্যাকাউন্ট তৈরি করুন','Continue with Google':'Google দিয়ে চালিয়ে যান','or use email':'অথবা ইমেইল ব্যবহার করুন',
      'Holding':'হোল্ডিং','Save holding':'হোল্ডিং সংরক্ষণ','Delete':'মুছুন','Notes':'নোট','Category':'ক্যাটাগরি','Display name':'প্রদর্শিত নাম','Subset / insert':'সাবসেট / ইনসার্ট','Image variation':'ইমেজ ভ্যারিয়েশন','Serial number':'সিরিয়াল নম্বর','Team / club':'টিম / ক্লাব','Condition':'অবস্থা','Quantity':'পরিমাণ','Cost basis / card ($)':'প্রতি কার্ড ক্রয়মূল্য ($)','Acquired from':'কোথা থেকে নেওয়া','Acquisition date':'ক্রয়ের তারিখ','Manual value ($)':'ম্যানুয়াল মূল্য ($)','Grading company':'গ্রেডিং কোম্পানি','Certification #':'সার্টিফিকেশন #','Rookie / RC':'রুকি / RC','Autograph':'অটোগ্রাফ','Relic / memorabilia':'রেলিক / স্মারক',
      'Confirm card details':'কার্ডের তথ্য নিশ্চিত করুন','Review before add':'যোগ করার আগে দেখুন','Confirm scan':'স্ক্যান নিশ্চিত করুন','OCR confidence':'OCR বিশ্বাসযোগ্যতা','Match with TCGdex':'TCGdex-এর সাথে মিলান','Use extracted fields':'পাওয়া তথ্য ব্যবহার করুন','Preparing crop…':'ক্রপ প্রস্তুত হচ্ছে…','Saving your card…':'কার্ড সংরক্ষণ হচ্ছে…',
      'Only Cardfolio interfaces with maintained translations are offered. Card names and marketplace titles are never machine-translated.':'শুধু রক্ষণাবেক্ষণ করা Cardfolio অনুবাদগুলো দেখানো হয়। কার্ডের নাম ও মার্কেটপ্লেস লিস্টিংয়ের শিরোনাম মেশিনে অনুবাদ করা হয় না।'
    }
  };

  const TITLE={home:{en:'Home',es:'Inicio',bn:'হোম'},portfolio:{en:'Portfolio',es:'Portafolio',bn:'পোর্টফোলিও'},scan:{en:'Scan a card',es:'Escanear una tarjeta',bn:'কার্ড স্ক্যান করুন'},watchlist:{en:'Watchlist',es:'Lista de seguimiento',bn:'ওয়াচলিস্ট'},market:{en:'Market',es:'Mercado',bn:'মার্কেট'},grading:{en:'Grading',es:'Calificación',bn:'গ্রেডিং'},profile:{en:'Profile',es:'Perfil',bn:'প্রোফাইল'}};
  const skip=n=>!!n.parentElement?.closest('.album-copy strong,.asset-title h1,.holding-name,.evidence-row strong,.embedded-listing-copy strong,[data-no-i18n],script,style,textarea');
  const dynamic=(base,code)=>{
    let m=base.match(/^(\d+) holdings$/i);if(m)return code==='es'?`${m[1]} posiciones`:`${m[1]} হোল্ডিংস`;
    m=base.match(/^(\d+) cards$/i);if(m)return code==='es'?`${m[1]} tarjetas`:`${m[1]} কার্ড`;
    m=base.match(/^(\d+) priced$/i);if(m)return code==='es'?`${m[1]} con precio`:`${m[1]} দামযুক্ত`;
    m=base.match(/^(\d+) pending$/i);if(m)return code==='es'?`${m[1]} pendientes`:`${m[1]} অপেক্ষমাণ`;
    m=base.match(/^(\d+) holdings · (\d+) pending$/i);if(m)return code==='es'?`${m[1]} posiciones · ${m[2]} pendientes`:`${m[1]} হোল্ডিংস · ${m[2]} অপেক্ষমাণ`;
    return null;
  };
  function translated(base,code){if(code==='en')return base;return STRINGS[code]?.[base]||dynamic(base,code)||base}
  function correctTitle(code){const e=document.getElementById('viewTitle');let view='home';try{view=state?.view||'home'}catch{}const value=TITLE[view]?.[code]||TITLE.home[code];if(e&&value)e.textContent=value}
  function apply(code=localStorage.getItem(KEY)||'en'){
    if(!['en','es','bn'].includes(code))code='en';locale=code;
    const root=document.body;if(!root)return;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walk.nextNode())nodes.push(walk.currentNode);
    for(const n of nodes){if(skip(n))continue;const raw=n.nodeValue||'',trim=raw.trim();if(!trim)continue;let base=baseText.get(n);if(!base){
      // This supplement only owns text that the primary locale layer did not translate.
      // If the current string is one of our English keys/patterns, preserve it as base.
      if(STRINGS.es[trim]||STRINGS.bn[trim]||/^(\d+) (holdings|cards|priced|pending)$/i.test(trim)||/^(\d+) holdings · (\d+) pending$/i.test(trim))base=trim;else continue;baseText.set(n,base);
    }
      const next=translated(base,code),lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'';if(raw!==lead+next+tail)n.nodeValue=lead+next+tail;
    }
    root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{const raw=el.getAttribute('placeholder')||'';if(!el.dataset.cfSupplementBase&&(STRINGS.es[raw]||STRINGS.bn[raw]))el.dataset.cfSupplementBase=raw;const base=el.dataset.cfSupplementBase;if(base)el.setAttribute('placeholder',translated(base,code))});
    correctTitle(code);
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('cardfolio:locale-changed',e=>apply(e.detail?.locale||localStorage.getItem(KEY)||'en'));
  window.cardfolioLocaleSupplement={apply};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(),{once:true});else apply();
})();
