/* Luis Montañez Escobar */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let latest=null,active=null,configPromise=null,lastKey='';
  const links=['PDF','DOCX','ODT'].map(format=>$('download'+format));
  const selected=()=>latest?{...latest.selection,period:$('documentPeriod').value}:null;
  const key=()=>JSON.stringify(selected());
  const status=message=>{$('documentStatus').textContent=message;$('documentStatus').hidden=!message;};
  function busy(value){links.forEach(link=>{link.setAttribute('aria-disabled',String(value));link.disabled=value;});$('documentPeriod').disabled=value;}
  function update(detail){
    latest=detail;$('documentPeriod').querySelector('[value="month"]').textContent=detail.monthLabel;
    const current=key();
    if(active&&current!==lastKey){active.abort();active=null;busy(false);status('Selección modificada. Vuelve a descargar.');}
    lastKey=current;
    $('odtVersion').textContent=`${detail.selection.annex?'Con':'Sin'} anexo 1 · ${$('documentPeriod').value==='all'?'14 meses':detail.monthLabel} · según los filtros seleccionados`;
  }
  function complete(selection){return selection.period==='all'&&selection.legalDates&&!selection.entity&&!selection.office&&!selection.stage&&!selection.annexFilter&&!selection.query;}
  async function api(){
    if(!configPromise)configPromise=fetch('export-config.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('No se pudo preparar la descarga.');const c=await r.json();const url=new URL(c.apiBase);if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('No se pudo preparar la descarga.');return url.href.replace(/\/$/,'');}).catch(e=>{configPromise=null;throw e;});
    return configPromise;
  }
  async function json(response){
    const body=await response.json();if(!response.ok)throw Error(body.message||'No se pudo preparar la descarga.');return body;
  }
  function pause(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
  async function save(response,format,snapshot,signal){
    if(!response.ok)throw Error('No se pudo descargar el archivo.');
    const blob=await response.blob();if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const disposition=response.headers.get('Content-Disposition')||'';
    const name=disposition.match(/filename="([^"]+)"/)?.[1]||`Calendario_electoral_${snapshot.annex?'con':'sin'}_anexo_1.${format.toLowerCase()}`;
    const objectURL=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectURL;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
  }
  async function download(format){
    if(active||!latest)return;
    const snapshot=structuredClone(selected()),digest=latest.dataSha256,controller=new AbortController();active=controller;lastKey=key();busy(true);status(`Preparando ${format}…`);
    try{
      if(complete(snapshot)){
        const path=`downloads/Calendario_mensual_2026_2027_${snapshot.annex?'con':'sin'}_anexo_1.${format.toLowerCase()}`;
        await save(await fetch(path,{signal:controller.signal}),format,snapshot,controller.signal);
      }else{
        if(!navigator.onLine)throw Error('Conéctate a internet para preparar esta selección.');
        const base=await api();if(controller.signal.aborted)return;
        const job=await json(await fetch(base+'/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:snapshot,dataSha256:digest}),signal:controller.signal}));
        const deadline=Date.now()+240000;let ready=false;
        while(Date.now()<deadline){
          const progress=await json(await fetch(base+'/exports/'+job.id,{signal:controller.signal,cache:'no-store'}));
          if(progress.status==='failed')throw Error(progress.message||'No se pudo preparar esta selección.');
          if(progress.status==='ready'){if(progress.dataSha256!==digest)throw Error('Actualiza la página para descargar la versión vigente.');ready=true;break;}
          await pause(1800,controller.signal);
        }
        if(!ready)throw Error('La preparación está tardando más de lo habitual. Intenta de nuevo.');
        await save(await fetch(base+'/exports/'+job.id+'/'+format.toLowerCase(),{signal:controller.signal}),format,snapshot,controller.signal);
      }
      status(`${format} preparado con tu selección.`);
    }catch(error){if(error.name!=='AbortError')status(error.message||'No se pudo preparar la descarga.');}
    finally{if(active===controller){active=null;busy(false);}}
  }
  links.forEach(link=>link.addEventListener('click',event=>{event.preventDefault();download(link.id.replace('download',''));}));
  $('documentPeriod').addEventListener('change',()=>{if(latest)update(latest);});
  addEventListener('calendar:selection',event=>update(event.detail));
  if(window.calendarDownloadState)update(window.calendarDownloadState);
})();
