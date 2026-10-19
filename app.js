/* Ficha de Ponto BERG – app offline. Formulário gerado do XLSForm (form.js). */
"use strict";
const APP_VERSION = "0.9.3";
const F = window.FORM, CH = F.choices;
const SEC_COLORS = {g_ident:"#201F1E",g_aflor:"#7A5A2E",g_macro:"#8F3032",g_miner:"#8F3032",g_testes:"#9A6B1E",g_estr:"#3F6B3F",g_alt:"#5C1F1F",g_interp:"#6E6659",g_obs:"#201F1E"};
const META = new Set(["start","end","today"]);
const NAO_DUPLICAR = new Set(["ponto","amostra","observacoes","croqui"]);

/* ================= árvore do formulário ================= */
function buildTree(rows){
  const root={kind:"root",children:[]},st=[root];
  for(const r of rows){
    if(r.t==="begin_group"||r.t==="begin_repeat"){const n={...r,kind:r.t==="begin_group"?"group":"repeat",children:[]};st[st.length-1].children.push(n);st.push(n);}
    else if(r.t==="end_group"||r.t==="end_repeat")st.pop();
    else st[st.length-1].children.push({...r,kind:"leaf"});
  }
  return root;
}
const TREE=buildTree(F.rows);
const SCREENS=TREE.children.filter(n=>n.kind==="group");
const REPEAT=(function f(n){for(const c of n.children||[]){if(c.kind==="repeat")return c;const x=f(c);if(x)return x;}})(TREE);
const REP_LEAVES=[];(function f(n){for(const c of n.children){if(c.kind==="leaf")REP_LEAVES.push(c);else f(c);}})(REPEAT);
const REP_NAMES=new Set(REP_LEAVES.map(l=>l.n));
const LEAVES=[];(function f(n){for(const c of n.children){if(c.kind==="leaf")LEAVES.push(c);else if(c.kind==="group")f(c);}})(TREE);
const BYNAME=Object.fromEntries(F.rows.map(r=>[r.n,r]));
const listOf=t=>t.split(" ")[1]||null, baseType=t=>t.split(" ")[0];
const AUX=/^(lbl_|solo_(fam|pre|adj|nota)[12]$|solo_pont$)/;
const EXCOLS=LEAVES.filter(l=>{const t=baseType(l.t);return !META.has(t)&&t!=="note"&&listOf(l.t)!=="ver"&&!AUX.test(l.n);}).map(l=>l.n);

/* ================= banco local (IndexedDB) ================= */
const DB=(()=>{
  let dbp;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open("berg-fichas",1);
    r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore("fichas",{keyPath:"id"});d.createObjectStore("kv");};
    r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));
  const run=(store,mode,fn)=>open().then(d=>new Promise((res,rej)=>{const t=d.transaction(store,mode);const req=fn(t.objectStore(store));
    t.oncomplete=()=>res(req&&"result"in req?req.result:undefined);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);}));
  return{all:()=>run("fichas","readonly",s=>s.getAll()),put:r=>run("fichas","readwrite",s=>s.put(r)),
    del:id=>run("fichas","readwrite",s=>s.delete(id)),get:k=>run("kv","readonly",s=>s.get(k)),set:(k,v)=>run("kv","readwrite",s=>s.put(v,k))};
})();

/* ================= motor de lógica ================= */
let CUR=null, REL={}, CALC={};
const SEL=(v,o)=>Array.isArray(v)&&v.includes(o), CNT=v=>Array.isArray(v)?v.length:0;
const fnCache={};
const IF=(c,a,b)=>c?a:b, CONCAT=(...a)=>a.map(x=>x==null?"":x).join(""), COAL=(a,b)=>(a===""||a==null)?b:a;
function ev(js,ctx,cur){
  if(!js)return true;
  const f=fnCache[js]||(fnCache[js]=new Function("V","SEL","CNT","CUR","IF","CONCAT","COAL","CHN","return ("+js+");"));
  const V=n=>{
    if(ctx&&REP_NAMES.has(n)){const v=ctx[n];return v==null?"":v;}
    if(n in CALC)return CALC[n];
    if(REL[n]===false)return "";
    const v=CUR.values[n];return v==null?"":v;
  };
  const CHN=n=>{const v=V(n);if(v==="")return "";const l=listOf(BYNAME[n].t);return choiceLabel(l,v);};
  try{return f(V,SEL,CNT,cur,IF,CONCAT,COAL,CHN);}catch(e){console.warn(js,e);return true;}
}
const nomeGeo=v=>v.geologo==="outro"?(v.geologo_outro||"Outro"):(v.geologo?choiceLabel("geologos",v.geologo):"");
const choiceLabel=(list,v)=>{const o=(CH[list]||[]).find(c=>c[0]===String(v));return o?o[1]:v;};
function recompute(){
  REL={};CALC={};
  (function walk(n,pr){for(const c of n.children){
    if(c.kind==="repeat"){REL[c.n]=pr&&ev(c.rel);continue;}
    const r=pr&&ev(c.rel);REL[c.n]=r;
    if(c.kind==="group")walk(c,r);else if(baseType(c.t)==="calculate")CALC[c.n]=r?calc(c.n):"";
  }})(TREE,true);
}
function calc(name,ctx){
  const leaf=BYNAME[name];if(!leaf||!leaf.calc)return "";
  const v=ev(leaf.calc,ctx);return v==null||v===true&&leaf.calc===""?"":v;
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const interp=(s,ctx)=>s.replace(/\$\{(\w+)\}/g,(m,n)=>{const v=(n in CALC)?CALC[n]:(ctx&&REP_NAMES.has(n)?ctx[n]:CUR.values[n]);return v==null?"":esc(v);}).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
const isEmpty=v=>v==null||v===""||(Array.isArray(v)&&!v.length);
function errorsFor(leaf,ctx){
  const t=baseType(leaf.t);if(["note","calculate"].includes(t)||META.has(t))return null;
  const v=ctx?ctx[leaf.n]:CUR.values[leaf.n];
  if(leaf.req&&ev(leaf.req,ctx)&&isEmpty(v))return leaf.reqm||"Resposta obrigatória.";
  if(!isEmpty(v)&&leaf.con&&!ev(leaf.con,ctx,t==="integer"?Number(v):v))return leaf.conm||"Valor inválido.";
  return null;
}
function screenErrors(i){
  const errs=[];
  (function walk(n){for(const c of n.children){
    if(REL[c.n]===false)continue;
    if(c.kind==="group")walk(c);
    else if(c.kind==="repeat")CUR.medidas.forEach((m,k)=>{for(const l of REP_LEAVES){if(!ev(l.rel,m))continue;const e=errorsFor(l,m);if(e)errs.push({n:l.n,k,e});}});
    else{const e=errorsFor(c);if(e)errs.push({n:c.n,e});}
  }})(SCREENS[i]);
  return errs;
}
const visibleScreens=()=>{recompute();return SCREENS.map((s,i)=>i).filter(i=>REL[SCREENS[i].n]!==false);};

/* ================= estado do app ================= */
let RECS=[], SETTINGS={geologo:""}, PROJS=[], PROJ=null, view="projects", screenIdx=0, showErr=false, dupFrom=null;
const $=id=>document.getElementById(id);
const app=$("app");
function toast(m,ms=2400){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>t.hidden=true,ms);}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const nowIso=()=>new Date().toISOString();
function fmt(iso){if(!iso)return "";const d=new Date(iso),p=n=>String(n).padStart(2,"0");return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;}
const SEM_PROJ="(sem projeto)";
const projDe=r=>r.projeto||SEM_PROJ;
const recsProj=()=>PROJ?RECS.filter(r=>projDe(r)===PROJ):RECS;
const byCreated=()=>[...recsProj()].sort((a,b)=>b.created.localeCompare(a.created));
const pendentes=()=>recsProj().filter(r=>!r.exported);
function listaProjetos(){
  const nomes=new Set(PROJS.map(p=>p.nome));for(const r of RECS)nomes.add(projDe(r));
  return [...nomes].map(n=>{const rs=RECS.filter(r=>projDe(r)===n);const p=PROJS.find(x=>x.nome===n);
    return{nome:n,total:rs.length,pend:rs.filter(r=>!r.exported).length,ult:rs.reduce((a,r)=>r.updated>a?r.updated:a,p?p.criado:"")};})
    .sort((a,b)=>b.ult.localeCompare(a.ult));
}
const salvarProjs=()=>DB.set("projetos",PROJS);

let saveTimer;
function saveCur(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(!CUR)return;CUR.updated=nowIso();CUR.exported=false;DB.put(CUR).catch(e=>toast("Erro ao salvar: "+e.message));},300);}
function onChange(){saveCur();clearTimeout(onChange._t);onChange._t=setTimeout(refresh,50);}

function sugerirCodigo(){
  const last=byCreated()[0];if(!last||!last.values.ponto)return "";
  const m=String(last.values.ponto).match(/^(.*?)(\d+)(\D*)$/);if(!m)return "";
  const n=String(Number(m[2])+1).padStart(m[2].length,"0");return m[1]+n+m[3];
}
async function novaFicha(baseId){
  const base=baseId?RECS.find(r=>r.id===baseId):null;
  const values={};
  if(base){for(const[k,v]of Object.entries(base.values))if(!NAO_DUPLICAR.has(k))values[k]=JSON.parse(JSON.stringify(v));}
  if(SETTINGS.geologo){values.geologo=SETTINGS.geologo;if(SETTINGS.geologo==="outro")values.geologo_outro=SETTINGS.geologo_outro||"";}
  values.ponto=sugerirCodigo();
  CUR={id:uid(),projeto:PROJ===SEM_PROJ?"":PROJ,created:nowIso(),updated:nowIso(),status:"rascunho",exported:false,values,medidas:[],croqui:null};
  RECS.push(CUR);await DB.put(CUR);
  dupFrom=base?base.values.ponto:null;
  openForm(0);
}
function openRec(id){CUR=RECS.find(r=>r.id===id);dupFrom=null;openForm(0);}
function openForm(i){view="form";screenIdx=i;showErr=false;render();window.scrollTo(0,0);}
function goHome(){if(CUR){clearTimeout(saveTimer);CUR.updated=nowIso();DB.put(CUR);}CUR=null;view="home";if(window.__reloadOnHome){setTimeout(()=>location.reload(),300);return;}render();window.scrollTo(0,0);}

/* ================= telas ================= */
function render(){
  if(view==="projects")return renderProjects();
  if(view==="dup")return renderDup();
  if(view==="home")return renderHome();
  if(view==="form")return renderForm();
  if(view==="export")return renderExport();
  if(view==="more")return renderMore();
}
function el(html){const t=document.createElement("template");t.innerHTML=html.trim();return t.content.firstElementChild;}

function renderProjects(){
  PROJ=null;SELMODE=false;SELSET.clear();
  const projs=listaProjetos(),pendTot=RECS.filter(r=>!r.exported).length;
  app.innerHTML="";
  app.appendChild(el(`<div class="top"><div style="flex:1;min-width:0" class="sub">v${APP_VERSION} · ficha ${esc(F.version)}</div><button id="more">Mais</button></div>`));
  const m=el(`<div class="main"></div>`);app.appendChild(m);
  m.appendChild(el(`<div class="hero"><img src="icons/logo-header.png" alt="BERG Serviços Geológicos"><div class="t">Fichas de Ponto</div><div class="s">${SETTINGS.geologo?"Geólogo: "+esc(nomeGeo(SETTINGS)):"BERG Serviços Geológicos"}</div></div>`));
  m.appendChild(el(`<h2>Novo projeto</h2>`));
  const f=el(`<form class="row" style="flex-wrap:nowrap"><input type="text" id="pnome" placeholder="Nome do projeto (ex.: Paramirim)" autocomplete="off" style="flex:1"><button class="btn primary" style="flex:0 0 auto">Criar</button></form>`);
  m.appendChild(f);
  f.onsubmit=async e=>{e.preventDefault();const n=$("pnome").value.trim();if(!n){toast("Digite o nome do projeto");return;}
    if(listaProjetos().some(p=>p.nome.toLowerCase()===n.toLowerCase())){toast("Já existe um projeto com esse nome");return;}
    PROJS.push({nome:n,criado:nowIso()});await salvarProjs();PROJ=n;view="home";render();window.scrollTo(0,0);};
  if(pendTot)m.appendChild(el(`<div class="banner warn"><span><b>${pendTot}</b> ficha${pendTot>1?"s":""} não exportada${pendTot>1?"s":""} no total</span></div>`));
  m.appendChild(el(`<h2>Projetos (${projs.length})</h2>`));
  const list=el(`<div class="list"></div>`);m.appendChild(list);
  if(!projs.length)list.appendChild(el(`<div class="muted">Nenhum projeto ainda. Digite o nome acima e toque em “Criar”.</div>`));
  for(const p of projs){
    const chip=p.pend?`<span class="chip draft">${p.pend} não export.</span>`:(p.total?`<span class="chip exp">exportado</span>`:"");
    const c=el(`<button class="card"><div><b>${esc(p.nome)}</b><div class="meta">${p.total} ficha${p.total===1?"":"s"}${p.ult?" · "+fmt(p.ult):""}</div></div>${chip}</button>`);
    c.onclick=()=>{PROJ=p.nome;view="home";render();window.scrollTo(0,0);};list.appendChild(c);
  }
  $("more").onclick=()=>{view="more";render();};
}

async function renomearProjeto(){
  const novo=(prompt("Novo nome do projeto:",PROJ)||"").trim();
  if(!novo||novo===PROJ)return;
  if(listaProjetos().some(p=>p.nome.toLowerCase()===novo.toLowerCase())){toast("Já existe um projeto com esse nome");return;}
  for(const r of RECS)if(projDe(r)===PROJ){r.projeto=novo;await DB.put(r);}
  const p=PROJS.find(x=>x.nome===PROJ);if(p)p.nome=novo;else PROJS.push({nome:novo,criado:nowIso()});
  await salvarProjs();PROJ=novo;render();toast("Projeto renomeado");
}
async function excluirProjeto(){
  if(recsProj().length){toast("Só é possível excluir projeto sem fichas");return;}
  if(!confirm("Excluir o projeto "+PROJ+"?"))return;
  PROJS=PROJS.filter(x=>x.nome!==PROJ);await salvarProjs();view="projects";render();toast("Projeto excluído");
}

let SELMODE=false; const SELSET=new Set();
function sairSelecao(){SELMODE=false;SELSET.clear();render();}
function cardStatus(r){return r.exported?`<span class="chip exp">exportada</span>`:(r.status==="final"?`<span class="chip final">finalizada</span>`:`<span class="chip draft">rascunho</span>`);}
/* toque longo (~0,5 s) para entrar no modo de seleção */
function longPress(node,onLong,onTap){
  let t=null,fired=false,x0=0,y0=0;
  node.addEventListener("pointerdown",e=>{fired=false;x0=e.clientX;y0=e.clientY;clearTimeout(t);
    t=setTimeout(()=>{fired=true;if(navigator.vibrate)try{navigator.vibrate(30);}catch(_){};onLong();},500);});
  const cancel=()=>clearTimeout(t);
  node.addEventListener("pointermove",e=>{if(Math.abs(e.clientX-x0)>10||Math.abs(e.clientY-y0)>10)cancel();});
  node.addEventListener("pointerup",cancel);node.addEventListener("pointerleave",cancel);node.addEventListener("pointercancel",cancel);
  node.addEventListener("contextmenu",e=>e.preventDefault());
  node.addEventListener("click",e=>{if(fired){e.preventDefault();fired=false;return;}onTap();});
}
function hora(iso){const d=new Date(iso),p=n=>String(n).padStart(2,"0");return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function resumoPonto(r){
  const v=r.values,parts=[];
  if(v.tipo_ponto)parts.push(choiceLabel("tipo_ponto",v.tipo_ponto));
  if(Array.isArray(v.exposicao)&&v.exposicao.length)parts.push(v.exposicao.map(x=>choiceLabel("exposicao",x)).join(", "));
  const sig=[v.litotipo,v.tipo_ponto==="contato"?v.litotipo_t:""].filter(Boolean).join(" / ");
  return {exp:parts.join(" · "),sig};
}
function renderDup(){
  const RS=[...recsProj()].sort((a,b)=>b.created.localeCompare(a.created));
  app.innerHTML="";
  app.appendChild(el(`<div class="top"><button id="dupback">‹ Voltar</button><h1>Duplicar Ponto</h1></div>`));
  const m=el(`<div class="main"></div>`);app.appendChild(m);
  m.appendChild(el(`<div class="muted">Escolha o ponto a copiar. A ficha nova recebe todos os campos dele, exceto código do ponto, medidas estruturais, amostra, observações e croqui.</div>`));
  const list=el(`<div class="list"></div>`);m.appendChild(list);
  if(!RS.length)list.appendChild(el(`<div class="muted">Este projeto ainda não tem fichas para duplicar.</div>`));
  for(const r of RS){
    const {exp,sig}=resumoPonto(r);
    const c=el(`<button class="card"><div style="min-width:0"><b>${esc(r.values.ponto||"(sem código)")}</b>${sig?` <span class="chip final">${esc(sig)}</span>`:""}<div class="meta">${esc(exp||"—")}</div><div class="meta">🕒 ${hora(r.created)}</div></div><span class="chip draft">copiar</span></button>`);
    c.onclick=()=>novaFicha(r.id);list.appendChild(c);
  }
  $("dupback").onclick=()=>{view="home";render();window.scrollTo(0,0);};
}

function renderHome(){
  const pend=pendentes().length;
  app.innerHTML="";
  const RS=recsProj();
  for(const id of [...SELSET])if(!RS.some(r=>r.id===id))SELSET.delete(id);
  const ordenadas=[...RS].sort((a,b)=>b.updated.localeCompare(a.updated));
  if(SELMODE){
    app.appendChild(el(`<div class="top"><button id="selx">✕ Cancelar</button><h1>${SELSET.size} selecionada${SELSET.size===1?"":"s"}</h1></div>`));
  }else{
    app.appendChild(el(`<div class="top"><button id="back">‹ Projetos</button><h1>${esc(PROJ)}</h1><button id="pmenu" aria-label="Opções do projeto">⋮</button></div>`));
  }
  const m=el(`<div class="main"></div>`);app.appendChild(m);
  if(!SELMODE){
    const pm=el(`<div class="row" id="pmrow" hidden><button class="btn" id="pren">Renomear projeto</button><button class="btn danger" id="pdel">Excluir projeto</button></div>`);m.appendChild(pm);
    m.appendChild(el(`<button class="btn primary big" id="nova">+ Nova ficha</button>`));
    const dup=el(`<button class="btn" id="dup">⧉ Duplicar Ponto</button>`);
    dup.disabled=!RS.length;m.appendChild(dup);
    if(pend)m.appendChild(el(`<div class="banner warn"><span><b>${pend}</b> ficha${pend>1?"s":""} não exportada${pend>1?"s":""}</span><button class="btn" id="exp1">Exportar</button></div>`));
    else if(RS.length)m.appendChild(el(`<div class="banner ok">Todas as fichas deste projeto foram exportadas.</div>`));
    m.appendChild(el(`<h2>Fichas do projeto (${RS.length})</h2>`));
    if(RS.length)m.appendChild(el(`<div class="muted" style="margin-top:-10px">Toque e segure uma ficha para selecionar e excluir várias.</div>`));
  }else{
    const all=RS.length&&SELSET.size===RS.length;
    const sa=el(`<label class="opt selall${all?" on":""}"><input type="checkbox" id="selall"${all?" checked":""}><span><b>Selecionar todas as fichas do projeto</b> (${RS.length})</span></label>`);
    m.appendChild(sa);
    sa.querySelector("input").onchange=e=>{SELSET.clear();if(e.target.checked)RS.forEach(r=>SELSET.add(r.id));render();};
  }
  const list=el(`<div class="list"></div>`);m.appendChild(list);
  if(!RS.length)list.appendChild(el(`<div class="muted">Nenhuma ficha ainda. Toque em “+ Nova ficha”.</div>`));
  for(const r of ordenadas){
    const v=r.values,on=SELSET.has(r.id);
    const desc=[v.tipo_ponto?choiceLabel("tipo_ponto",v.tipo_ponto):"",v.litotipo||""].filter(Boolean).join(" · ");
    const right=SELMODE?`<span class="selr">${cardStatus(r)}<span class="selbox${on?" on":""}" aria-hidden="true">${on?"✓":""}</span></span>`:cardStatus(r);
    const c=el(`<button class="card${SELMODE&&on?" sel":""}" aria-pressed="${SELMODE?on:false}"><div><b>${esc(v.ponto||"(sem código)")}</b><div class="meta">${esc(desc)} · ${fmt(r.updated)}</div></div>${right}</button>`);
    const toggle=()=>{if(SELSET.has(r.id))SELSET.delete(r.id);else SELSET.add(r.id);render();};
    longPress(c,()=>{if(!SELMODE){SELMODE=true;SELSET.clear();}SELSET.add(r.id);render();},()=>{if(SELMODE)toggle();else openRec(r.id);});
    list.appendChild(c);
  }
  if(SELMODE){
    app.appendChild(el(`<div class="bottom"><button class="btn" id="selcancel">Cancelar</button><button class="btn primary delbtn" id="seldel"${SELSET.size?"":" disabled"}>Excluir (${SELSET.size})</button></div>`));
    $("selx").onclick=sairSelecao;$("selcancel").onclick=sairSelecao;
    $("seldel").onclick=async()=>{
      const sel=RS.filter(r=>SELSET.has(r.id));if(!sel.length)return;
      const naoExp=sel.filter(r=>!r.exported).length;
      let msg=`Excluir ${sel.length} ficha${sel.length>1?"s":""} do projeto ${PROJ}? Isso não pode ser desfeito.`;
      if(naoExp)msg+=`\n\nATENÇÃO: ${naoExp} dessas fichas ainda NÃO foram exportadas e serão perdidas.`;
      if(!confirm(msg))return;
      for(const r of sel)await DB.del(r.id);
      RECS=RECS.filter(r=>!SELSET.has(r.id));
      toast(`${sel.length} ficha${sel.length>1?"s":""} excluída${sel.length>1?"s":""}`);
      sairSelecao();
    };
    return;
  }
  $("nova").onclick=()=>novaFicha(false);$("dup").onclick=()=>{view="dup";render();window.scrollTo(0,0);};
  $("back").onclick=()=>{view="projects";render();window.scrollTo(0,0);};
  $("pmenu").onclick=()=>{$("pmrow").hidden=!$("pmrow").hidden;};
  $("pren").onclick=renomearProjeto;$("pdel").onclick=excluirProjeto;
  if(PROJ===SEM_PROJ){$("pren").hidden=true;}
  if($("exp1"))$("exp1").onclick=()=>{view="export";render();};
  app.appendChild(el(`<div class="bottom"><button class="btn primary" id="exp2">Exportar fichas do projeto</button></div>`));
  $("exp2").onclick=()=>{view="export";render();};
}

function renderForm(){
  recompute();
  const vis=visibleScreens();if(!vis.includes(screenIdx))screenIdx=vis[0];
  const sc=SCREENS[screenIdx],pos=vis.indexOf(screenIdx),last=pos===vis.length-1;
  app.innerHTML="";
  const top=el(`<div class="top"><button id="home">‹ Fichas</button><h1>${esc(CUR.values.ponto||"Nova ficha")}</h1><select id="jump" aria-label="Ir para seção"><option value="">☰ Seções</option>${vis.map(i=>`<option value="${i}">${interp(SCREENS[i].l).replace(/<[^>]+>/g,"")}</option>`).join("")}</select></div>`);
  app.appendChild(top);
  app.appendChild(el(`<div class="band" style="background:${SEC_COLORS[sc.n.replace(/_t$/,"")]||"#8F3032"}"><span>${interp(sc.l)}</span><small>${pos+1}/${vis.length}</small></div>`));
  app.appendChild(el(`<div class="progress"><i style="width:${(pos+1)/vis.length*100}%"></i></div>`));
  const m=el(`<div class="main" id="body"></div>`);app.appendChild(m);
  if(dupFrom&&screenIdx===vis[0])m.appendChild(el(`<div class="banner info">Campos copiados de <b>${esc(dupFrom)}</b>. Revise tudo antes de finalizar.</div>`));
  const errs=showErr?screenErrors(screenIdx):[];
  renderChildren(sc,m,null,errs);
  if(last){
    const z=el(`<div class="row" style="margin-top:12px"><button class="btn danger" id="del">Excluir esta ficha</button></div>`);m.appendChild(z);
    $("del").onclick=async()=>{if(!confirm("Excluir a ficha "+(CUR.values.ponto||"")+"? Isso não pode ser desfeito."))return;await DB.del(CUR.id);RECS=RECS.filter(r=>r.id!==CUR.id);CUR=null;view="home";render();toast("Ficha excluída");};
  }
  app.appendChild(el(`<div class="bottom"><button class="btn" id="prev"${pos===0?" disabled":""}>‹ Anterior</button><button class="btn primary" id="next">${last?"Finalizar ✓":"Próxima ›"}</button></div>`));
  $("home").onclick=goHome;
  $("jump").onchange=e=>{if(e.target.value!==""){screenIdx=+e.target.value;showErr=false;render();window.scrollTo(0,0);}};
  $("prev").onclick=()=>{if(pos>0){screenIdx=vis[pos-1];showErr=false;render();window.scrollTo(0,0);}};
  $("next").onclick=()=>{
    recompute();
    if(screenErrors(screenIdx).length){showErr=true;render();const e=document.querySelector(".err");if(e)e.scrollIntoView({block:"center"});toast("Corrija os campos marcados");return;}
    showErr=false;
    if(!last){screenIdx=vis[pos+1];render();window.scrollTo(0,0);return;}
    for(const i of visibleScreens())if(screenErrors(i).length){screenIdx=i;showErr=true;render();toast("Há campos obrigatórios pendentes");return;}
    CUR.status="final";CUR.updated=nowIso();CUR.exported=false;DB.put(CUR);
    toast("Ficha "+(CUR.values.ponto||"")+" finalizada");CUR=null;view="home";render();window.scrollTo(0,0);
  };
  refresh();
}

function renderChildren(node,host,ctx,errs,k){
  for(const c of node.children){
    if(c.kind==="group"){renderChildren(c,host,ctx,errs,k);continue;}
    if(c.kind==="repeat"){host.appendChild(renderRepeat(c,errs));continue;}
    const t=baseType(c.t);if(META.has(t)||t==="calculate")continue;
    host.appendChild(renderLeaf(c,ctx,errs,k));
  }
}
function renderLeaf(leaf,ctx,errs,k){
  const t=baseType(leaf.t),list=listOf(leaf.t),store=ctx||CUR.values,val=store[leaf.n];
  const w=document.createElement("div");w.className="q";w.dataset.n=leaf.n;if(ctx)w.dataset.k=k;w._ctx=ctx;
  if(t==="note"){
    const isImg=!!leaf.img;
    const n=el(`<div class="note${leaf.n==="pct_aviso"?" warn":(isImg?"":" info")}"></div>`);n.dataset.tpl=leaf.l;n.innerHTML=interp(leaf.l,ctx);
    if(isImg){const im=document.createElement("img");im.src="img/"+leaf.img;im.alt=leaf.l;im.loading="lazy";n.appendChild(im);}
    w.appendChild(n);return w;
  }
  if(list==="ver"){
    const on=SEL(val,"ver");const b=el(`<button type="button" class="ref" aria-pressed="${on}">${esc(leaf.l)} ${on?"▲":"▼"}</button>`);
    b.onclick=()=>{store[leaf.n]=on?[]:["ver"];saveCur();render();};w.appendChild(b);return w;
  }
  const lab=el(`<div class="qlabel"><span class="txt">${interp(leaf.l,ctx)}<span class="req" hidden> *</span></span></div>`);w.appendChild(lab);
  w._star=lab.querySelector(".req");
  if(leaf.g){
    const gb=el(`<button type="button" class="gbtn" aria-expanded="false" aria-label="Ajuda">!</button>`);lab.appendChild(gb);
    const gd=el(`<div class="guid" hidden></div>`);gd.textContent=leaf.g;w.appendChild(gd);
    gb.onclick=()=>{gd.hidden=!gd.hidden;gb.setAttribute("aria-expanded",String(!gd.hidden));};
  }
  if(leaf.h){const h=el(`<div class="hint"></div>`);h.textContent=leaf.h;w.appendChild(h);}
  const id="f_"+leaf.n+(ctx?"_"+k:"");
  const set=v=>{store[leaf.n]=v;const ex=w.querySelector(".err");if(ex)ex.remove();if((leaf.n==="geologo"&&v)||leaf.n==="geologo_outro"){SETTINGS.geologo=store.geologo;SETTINGS.geologo_outro=store.geologo_outro||"";DB.set("settings",SETTINGS);}onChange();};
  if(list&&list.startsWith("${")){   // seleção a partir das medidas registradas (repeat)
    const s=el(`<select class="inp" id="${id}" data-dyn="1"></select>`);s._leaf=leaf;fillDyn(s,leaf,val);
    s.onchange=()=>set(s.value);w.appendChild(s);
    const vazio=el(`<div class="hint" data-dynempty="1">Nenhuma fratura registrada ainda. Adicione em “Medida estrutural (Clar)” acima.</div>`);
    vazio.hidden=s.options.length>1;w.appendChild(vazio);
  }else if(t==="select_one"&&leaf.app==="minimal"){
    const s=el(`<select class="inp" id="${id}"><option value="">— selecione —</option>${CH[list].map(o=>`<option value="${o[0]}"${String(val)===o[0]?" selected":""}>${esc(o[1])}</option>`).join("")}</select>`);
    s.onchange=()=>set(s.value);w.appendChild(s);
  }else if(t==="select_multiple"&&leaf.app==="minimal"){   // lista recolhida de múltipla escolha
    const opts=CH[list];
    const resumo=()=>{const a=Array.isArray(store[leaf.n])?store[leaf.n]:[];return a.length?a.map(x=>choiceLabel(list,x).split(": ")[0]).join(", "):"— selecione —";};
    const btn=el(`<button type="button" class="inp msel" id="${id}" aria-expanded="false"><span></span><b>▾</b></button>`);
    btn.querySelector("span").textContent=resumo();
    const box=el(`<div class="opts msel-list" hidden></div>`);
    btn.onclick=()=>{box.hidden=!box.hidden;btn.setAttribute("aria-expanded",String(!box.hidden));btn.querySelector("b").textContent=box.hidden?"▾":"▴";};
    opts.forEach((o,j)=>{
      const on=SEL(val,o[0]);
      const l=el(`<label class="opt${on?" on":""}"><input type="checkbox" id="${id}_${j}"${on?" checked":""}><span></span></label>`);
      l.querySelector("span").textContent=o[1];
      const inp=l.querySelector("input");
      inp.onclick=()=>{let a=Array.isArray(store[leaf.n])?[...store[leaf.n]]:[];a=inp.checked?[...a,o[0]]:a.filter(x=>x!==o[0]);set(a);
        l.classList.toggle("on",inp.checked);btn.querySelector("span").textContent=resumo();};
      box.appendChild(l);
    });
    w.appendChild(btn);w.appendChild(box);
  }else if(t==="select_one"||t==="select_multiple"){
    const multi=t==="select_multiple",opts=CH[list];
    const box=el(`<div class="opts${opts.length>=6&&Math.max(...opts.map(o=>o[1].length))<=20?" two":""}"></div>`);
    opts.forEach((o,j)=>{
      const on=multi?SEL(val,o[0]):String(val)===o[0];
      const l=el(`<label class="opt${on?" on":""}"><input type="${multi?"checkbox":"radio"}" name="${id}" id="${id}_${j}"${on?" checked":""}><span></span></label>`);
      l.querySelector("span").textContent=o[1];
      const inp=l.querySelector("input");
      inp.onclick=()=>{
        if(multi){let a=Array.isArray(store[leaf.n])?[...store[leaf.n]]:[];a=inp.checked?[...a,o[0]]:a.filter(x=>x!==o[0]);set(a);}
        else if(String(store[leaf.n])===o[0]){inp.checked=false;set("");}else set(o[0]);
        box.querySelectorAll(".opt").forEach(x=>x.classList.toggle("on",x.querySelector("input").checked));
      };
      box.appendChild(l);
    });
    w.appendChild(box);
  }else if(t==="integer"){
    const i=el(`<input type="number" inputmode="numeric" id="${id}">`);i.value=val??"";i.oninput=()=>set(i.value===""?"":Number(i.value));w.appendChild(i);
  }else if(t==="text"){
    const multi=leaf.app==="multiline";const i=el(multi?`<textarea id="${id}"></textarea>`:`<input type="text" id="${id}" autocomplete="off">`);
    i.value=val??"";i.oninput=()=>set(i.value);w.appendChild(i);
  }else if(t==="image"){w.appendChild(drawPad());}
  const e=(errs||[]).find(x=>x.n===leaf.n&&(ctx?x.k===k:x.k===undefined));
  if(e){const d=el(`<div class="err"></div>`);d.textContent=e.e;w.appendChild(d);}
  return w;
}
function dynOptions(leaf){
  const out=[];for(const m of CUR.medidas){if(!ev(leaf.cf,m))continue;const t=calc("medida_txt",m);if(t&&m.dir_merg!==""&&m.dir_merg!=null&&!out.includes(t))out.push(t);}
  return out;
}
function fillDyn(s,leaf,val){
  const opts=dynOptions(leaf);if(val&&!opts.includes(val))opts.push(val);
  const sig=opts.join("|")+"#"+val;if(s._sig===sig)return;s._sig=sig;
  s.innerHTML=`<option value="">— escolha a medida —</option>`+opts.map(o=>`<option value="${esc(o)}"${o===val?" selected":""}>${esc(o)}</option>`).join("");
}
function renderRepeat(rep,errs){
  const w=el(`<div class="q" data-rep="1"></div>`);w.dataset.n=rep.n;
  w.appendChild(el(`<div class="qlabel"><span class="txt">${esc(rep.l)}</span></div>`));
  if(!CUR.medidas.length)w.appendChild(el(`<div class="muted">Nenhuma medida registrada.</div>`));
  CUR.medidas.forEach((m,k)=>{
    const c=el(`<div class="inst"><div class="inst-h"><span>Medida ${k+1}</span><button type="button" class="btn" style="padding:5px 10px">Remover</button></div></div>`);
    c.querySelector("button").onclick=()=>{CUR.medidas.splice(k,1);saveCur();render();};
    renderChildren(rep,c,m,errs,k);w.appendChild(c);
  });
  const add=el(`<button type="button" class="btn">+ Adicionar medida</button>`);add.onclick=()=>{CUR.medidas.push({});saveCur();render();};
  w.appendChild(add);return w;
}
function drawPad(){
  const box=el(`<div style="display:flex;flex-direction:column;gap:6px"><canvas class="draw" id="f_croqui"></canvas><div class="row" style="align-items:center"><span class="muted">Desenhe com o dedo</span><button type="button" class="btn" style="flex:0 0 auto;padding:6px 12px">Limpar</button></div></div>`);
  const c=box.querySelector("canvas"),clr=box.querySelector("button");
  requestAnimationFrame(()=>{
    const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=r.width*dpr;c.height=r.height*dpr;
    const g=c.getContext("2d");g.scale(dpr,dpr);g.fillStyle="#fff";g.fillRect(0,0,r.width,r.height);g.lineWidth=2.4;g.lineCap="round";g.lineJoin="round";g.strokeStyle="#111";
    if(CUR.croqui){const im=new Image();im.onload=()=>g.drawImage(im,0,0,r.width,r.height);im.src=CUR.croqui;}
    let down=false;const p=e=>{const b=c.getBoundingClientRect();return[e.clientX-b.left,e.clientY-b.top];};
    c.onpointerdown=e=>{down=true;c.setPointerCapture(e.pointerId);const[x,y]=p(e);g.beginPath();g.moveTo(x,y);};
    c.onpointermove=e=>{if(!down)return;const[x,y]=p(e);g.lineTo(x,y);g.stroke();};
    c.onpointerup=c.onpointercancel=()=>{if(!down)return;down=false;CUR.croqui=c.toDataURL("image/png");CUR.values.croqui="sim";saveCur();};
    clr.onclick=()=>{g.fillStyle="#fff";g.fillRect(0,0,r.width,r.height);CUR.croqui=null;CUR.values.croqui="";saveCur();};
  });
  return box;
}
function refresh(){
  if(view!=="form")return;
  recompute();
  document.querySelectorAll("#body .q").forEach(w=>{
    const n=w.dataset.n;
    if(w.dataset.rep){w.hidden=REL[n]===false;return;}
    const leaf=BYNAME[n];
    w.hidden=w.dataset.k!==undefined?!ev(leaf.rel,CUR.medidas[+w.dataset.k]):REL[n]===false;
    if(w._star&&leaf.req)w._star.hidden=!ev(leaf.req,w._ctx);
    const dyn=w.querySelector("select[data-dyn]");
    if(dyn&&document.activeElement!==dyn){fillDyn(dyn,leaf,CUR.values[n]||"");const ve=w.querySelector("[data-dynempty]");if(ve)ve.hidden=dyn.options.length>1;}
    const note=w.querySelector(".note");
    if(note&&note.dataset.tpl&&!note.querySelector("img"))note.innerHTML=interp(note.dataset.tpl,w._ctx);
  });
  const h=document.querySelector(".top h1");if(h)h.textContent=CUR.values.ponto||"Nova ficha";
}

/* ================= exportação ================= */
const curto=t=>String(t).split(": ")[0];
function cell(leaf,v){if(isEmpty(v))return "";const list=listOf(leaf.t);if(list)return Array.isArray(v)?v.map(x=>curto(choiceLabel(list,x))).join("; "):curto(choiceLabel(list,v));return v;}
function recordRows(rec){
  const prev=CUR;CUR=rec;recompute();
  const row={projeto:rec.projeto||"",ponto:rec.values.ponto||"",geologo:nomeGeo(rec.values),status:rec.status,criado:fmtIso(rec.created),atualizado:fmtIso(rec.updated)};
  for(const c of EXCOLS){if(c==="ponto"||c==="geologo")continue;
    if(REL[c]===false){row[c]="";continue;}
    const leaf=BYNAME[c];
    row[c]=baseType(leaf.t)==="calculate"?CALC[c]:(c==="croqui"?(rec.croqui?safe(rec.values.ponto||rec.id)+".png":""):cell(leaf,rec.values[c]));
  }
  const med=REL.medidas===false?[]:rec.medidas.map((m,i)=>({projeto:row.projeto,ponto:row.ponto,geologo:row.geologo,n:i+1,
    tipo_estrutura:cell(BYNAME.tipo_estrutura,m.tipo_estrutura),dir_merg:m.dir_merg??"",mergulho:m.mergulho??"",
    medida_clar:(m.dir_merg!=null&&m.dir_merg!==""?String(m.dir_merg).padStart(3,"0"):"")+"/"+(m.mergulho!=null&&m.mergulho!==""?String(m.mergulho).padStart(2,"0"):""),
    obs_estrutura:m.obs_estrutura||""}));
  CUR=prev;if(CUR)recompute();
  return{row,med};
}
function fmtIso(iso){const d=new Date(iso),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
const safe=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\-]+/g,"_").replace(/_+/g,"_");
function buildWorkbook(recs){
  const rows=[],meds=[];
  for(const r of [...recs].sort((a,b)=>(a.projeto||"").localeCompare(b.projeto||"")||(a.values.ponto||"").localeCompare(b.values.ponto||"",undefined,{numeric:true}))){const x=recordRows(r);rows.push(x.row);meds.push(...x.med);}
  const wb=XLSX.utils.book_new();
  const head=["projeto","ponto","geologo","status","criado","atualizado",...EXCOLS.filter(c=>c!=="ponto"&&c!=="geologo")];
  const ws1=XLSX.utils.json_to_sheet(rows,{header:head});ws1["!cols"]=head.map(h=>({wch:Math.min(40,Math.max(10,h.length+2))}));ws1["!freeze"]={xSplit:2,ySplit:1};
  XLSX.utils.book_append_sheet(wb,ws1,"pontos");
  const mh=["projeto","ponto","geologo","n","tipo_estrutura","dir_merg","mergulho","medida_clar","obs_estrutura"];
  const ws2=XLSX.utils.json_to_sheet(meds,{header:mh});ws2["!cols"]=mh.map(()=>({wch:16}));
  XLSX.utils.book_append_sheet(wb,ws2,"medidas");
  const dic=head.map(h=>({campo:h,pergunta:BYNAME[h]?((BYNAME[h].l||"(calculado)").replace(/\$\{lbl_base\}/g," – base (se contato)")):{projeto:"nome do projeto",status:"rascunho / final",criado:"data de criação",atualizado:"última alteração"}[h]||""}));
  const ws3=XLSX.utils.json_to_sheet(dic,{header:["campo","pergunta"]});ws3["!cols"]=[{wch:22},{wch:60}];
  XLSX.utils.book_append_sheet(wb,ws3,"dicionario");
  return XLSX.write(wb,{bookType:"xlsx",type:"array"});
}
async function buildZip(recs,nome){
  const zip=new JSZip();
  zip.file(nome+".xlsx",buildWorkbook(recs));
  zip.file(nome+"_backup.json",JSON.stringify({app:"berg-fichas",appVersion:APP_VERSION,formVersion:F.version,exportedAt:nowIso(),fichas:recs},null,1));
  for(const r of recs)if(r.croqui)zip.file("croquis/"+safe(r.values.ponto||r.id)+".png",r.croqui.split(",")[1],{base64:true});
  return zip.generateAsync({type:"blob",compression:"DEFLATE"});
}
function dataArq(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`;}
function stamp(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;}
async function shareOrDownload(blob,filename){
  const file=new File([blob],filename,{type:"application/zip"});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:filename});return "shared";}
    catch(e){if(e.name==="AbortError")return "cancel";}
  }
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);return "download";
}
function renderExport(){
  const pend=pendentes(),ALL=recsProj();
  app.innerHTML="";
  app.appendChild(el(`<div class="top"><button id="home">‹ Voltar</button><h1>Exportar – ${esc(PROJ||"todos os projetos")}</h1></div>`));
  const m=el(`<div class="main"></div>`);app.appendChild(m);
  m.appendChild(el(`<div class="muted">Gera um arquivo .zip com: planilha Excel (abas pontos, medidas e dicionário), croquis em PNG e um backup. Envie por WhatsApp, e-mail ou Drive.</div>`));
  m.appendChild(el(`<div class="kv"><span>Não exportadas</span><b>${pend.length}</b><span>Total ${PROJ?"no projeto":"no celular"}</span><b>${ALL.length}</b><span>Rascunhos</span><b>${ALL.filter(r=>r.status!=="final").length}</b></div>`));
  const b1=el(`<button class="btn primary big">Exportar não exportadas (${pend.length})</button>`);b1.disabled=!pend.length;m.appendChild(b1);
  const b2=el(`<button class="btn">Exportar todas (${ALL.length})</button>`);b2.disabled=!ALL.length;m.appendChild(b2);
  m.appendChild(el(`<div class="muted">Rascunhos também são exportados (coluna “status”). Depois de exportar, a ficha continua no celular até você excluí-la.</div>`));
  const go=async recs=>{
    try{
      toast("Gerando arquivo…");
      const gs=[...new Set(recs.map(r=>nomeGeo(r.values)).filter(Boolean))];
      const geo=safe(gs.length===1?gs[0]:(gs.length>1?"Equipe":nomeGeo(SETTINGS)||"Equipe")).replace(/^_+|_+$/g,"");
      const nome=`Pts.Campo_${safe(PROJ||"Todos").replace(/^_+|_+$/g,"")}_${geo}_${dataArq()}`;
      const blob=await buildZip(recs,nome);
      const r=await shareOrDownload(blob,nome+".zip");
      if(r==="cancel"){toast("Envio cancelado – fichas continuam como não exportadas");return;}
      const t=nowIso();for(const x of recs){x.exported=true;x.exportedAt=t;await DB.put(x);}
      toast(r==="shared"?"Arquivo enviado":"Arquivo salvo em Downloads");view=PROJ?"home":"projects";render();
    }catch(e){console.error(e);toast("Erro na exportação: "+e.message,5000);}
  };
  b1.onclick=()=>go(pend);b2.onclick=()=>go(ALL);
  $("home").onclick=()=>{view=PROJ?"home":"more";render();};
}

/* ================= mais: consolidar, restaurar, sobre ================= */
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;if(view==="more")render();});
async function readFiles(files){
  const out=[];
  for(const f of files){
    try{
      if(/\.json$/i.test(f.name)){out.push(...(JSON.parse(await f.text()).fichas||[]));}
      else{const z=await JSZip.loadAsync(f);for(const name of Object.keys(z.files))if(/_backup\.json$/i.test(name))out.push(...(JSON.parse(await z.files[name].async("string")).fichas||[]));}
    }catch(e){toast("Não consegui ler "+f.name);}
  }
  const map=new Map();for(const r of out){const o=map.get(r.id);if(!o||o.updated<r.updated)map.set(r.id,r);}
  return [...map.values()];
}
function renderMore(){
  app.innerHTML="";
  app.appendChild(el(`<div class="top"><button id="home">‹ Projetos</button><h1>Mais opções</h1></div>`));
  const m=el(`<div class="main"></div>`);app.appendChild(m);
  m.appendChild(el(`<h2>Exportar todos os projetos</h2>`));
  const bx=el(`<button class="btn">Exportar fichas de todos os projetos</button>`);bx.onclick=()=>{PROJ=null;view="export";render();};m.appendChild(bx);
  m.appendChild(el(`<h2>Consolidar arquivos da equipe</h2>`));
  m.appendChild(el(`<div class="muted">No escritório (computador ou celular): selecione os .zip recebidos de cada geólogo. O app junta tudo numa planilha única, sem duplicar fichas.</div>`));
  const bc=el(`<button class="btn primary">Selecionar arquivos para consolidar</button>`);m.appendChild(bc);
  const res=el(`<div></div>`);m.appendChild(res);
  m.appendChild(el(`<h2>Restaurar backup neste celular</h2>`));
  m.appendChild(el(`<div class="muted">Use se trocar de celular ou reinstalar o app: carrega as fichas de um arquivo exportado.</div>`));
  const br=el(`<button class="btn">Restaurar de arquivo</button>`);m.appendChild(br);
  m.appendChild(el(`<h2>Instalação e armazenamento</h2>`));
  const upd=el(`<button class="btn">Buscar atualização do app agora</button>`);m.appendChild(upd);
  upd.onclick=async()=>{
    if(!navigator.onLine){toast("Sem internet – conecte e tente de novo");return;}
    try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();toast("Atualizando…");setTimeout(()=>location.reload(),1500);}
    catch(e){toast("Não foi possível atualizar: "+e.message);}
  };
  const inst=el(`<button class="btn">Instalar app na tela inicial</button>`);inst.hidden=!deferredInstall;m.appendChild(inst);
  const st=el(`<div class="kv"></div>`);m.appendChild(st);
  m.appendChild(el(`<div class="muted">Se o botão “Instalar” não aparecer: menu ⋮ do Chrome → “Adicionar à tela inicial” / “Instalar app”.</div>`));
  const fin=$("filein");
  bc.onclick=()=>{fin.onchange=async()=>{
    const recs=await readFiles([...fin.files]);fin.value="";
    if(!recs.length){res.innerHTML="";res.appendChild(el(`<div class="banner warn">Nenhuma ficha encontrada nos arquivos.</div>`));return;}
    const porGeo={};for(const r of recs){const g=projDe(r)+" – "+(nomeGeo(r.values)||"(sem geólogo)");porGeo[g]=(porGeo[g]||0)+1;}
    res.innerHTML="";
    res.appendChild(el(`<div class="banner info" style="flex-direction:column;align-items:flex-start"><b>${recs.length} fichas encontradas</b><span>${Object.entries(porGeo).map(([g,n])=>esc(g)+": "+n).join(" · ")}</span></div>`));
    const g=el(`<button class="btn primary big" style="margin-top:8px">Gerar planilha consolidada</button>`);res.appendChild(g);
    g.onclick=async()=>{const nome="Pts.Campo_Consolidado_"+dataArq();await shareOrDownload(await buildZip(recs,nome),nome+".zip");};
  };fin.click();};
  br.onclick=()=>{fin.onchange=async()=>{
    const recs=await readFiles([...fin.files]);fin.value="";
    let n=0;for(const r of recs){const o=RECS.find(x=>x.id===r.id);if(o&&o.updated>=r.updated)continue;await DB.put(r);n++;}
    RECS=await DB.all();toast(n+" fichas restauradas");view="projects";render();
  };fin.click();};
  inst.onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;render();};
  (async()=>{
    let persist="não suportado",uso="";
    try{if(navigator.storage&&navigator.storage.persisted)persist=(await navigator.storage.persisted())?"protegido ✓":"não protegido";}catch(e){}
    try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();uso=(e.usage/1048576).toFixed(1)+" MB";}}catch(e){}
    st.innerHTML=`<span>Versão do app</span><b>${APP_VERSION}</b><span>Versão da ficha</span><b>${esc(F.version)}</b><span>Armazenamento</span><b>${persist}</b><span>Espaço usado</span><b>${uso||"—"}</b><span>Modo</span><b>${navigator.onLine?"online":"offline"}</b>`;
  })();
  $("home").onclick=()=>{view="projects";render();};
}

/* ================= início ================= */
(async function init(){
  try{
    RECS=await DB.all();
    SETTINGS=Object.assign(SETTINGS,(await DB.get("settings"))||{});
    PROJS=(await DB.get("projetos"))||[];
  }catch(e){app.innerHTML=`<div class="main"><div class="banner warn">Não foi possível abrir o armazenamento do celular (${esc(e.message)}). Saia do modo anônimo do navegador.</div></div>`;return;}
  try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist();}catch(e){}
  render();
  if("serviceWorker"in navigator&&location.protocol!=="file:"){
    navigator.serviceWorker.register("sw.js").catch(e=>console.warn("SW",e));
    const hadController=!!navigator.serviceWorker.controller;let reloaded=false;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(reloaded||!hadController)return;
      if(view==="home"||view==="projects"){reloaded=true;location.reload();}
      else{window.__reloadOnHome=true;toast("Nova versão instalada – será aplicada ao voltar ao início",4000);}
    });
  }
})();
