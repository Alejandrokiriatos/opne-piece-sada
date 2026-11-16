const OWNER="Alejandrokiriatos",REPO="opne-piece-sada",BRANCH="main",CATALOG_URL="https://raw.githubusercontent.com/"+OWNER+"/"+REPO+"/"+BRANCH+"/data/catalog.json";
let catalog=null,view="home",showAll=false;const $=s=>document.querySelector(s);
function money(n){return new Intl.NumberFormat("en-US",{style:"currency",currency:catalog?.currency||"USD"}).format(Number(n)||0)}
function toast(t){const e=$("#toast");e.textContent=t;e.style.display="block";setTimeout(()=>e.style.display="none",2500)}
function categoryName(id){return (catalog.categories||[]).find(c=>c.id===id)?.name||id||""}
function typeOfProduct(p){const key=(String(p.category||"")+" "+categoryName(p.category)+" "+(p.type||"")).toLowerCase();if(/evento|event/.test(key))return "event";if(/dulce|postre|pastel|repost|sweet|dessert|bakery|helado/.test(key))return "sweet";if(/cafe|café|coffee|espresso|frappe|frappé/.test(key))return "coffee";return "other"}
function productCard(p){return '<article class="product"><img src="'+(p.image||"")+'" alt="'+p.name+'" loading="lazy"><h3>'+p.name+'</h3><p>'+(p.description||"")+'</p><div class="price">'+money(p.price)+'</div></article>'}
function render(){
 if(!catalog)return;
 const q=$("#search").value.toLowerCase(),products=(catalog.products||[]).filter(p=>p.active!==false&&(p.name+" "+(p.description||"")).toLowerCase().includes(q));
 const productView=["home","coffee","sweets"].includes(view),eventView=view==="events",aboutView=view==="about";
 $("#products").hidden=!productView;$("#event-feature").hidden=!eventView;$("#about-page").hidden=!aboutView;\n // Nunca conservar ni mostrar tarjetas de productos fuera de Inicio, Café o Dulces.\n if(!productView)$("#products").replaceChildren();
 $("#section-heading").parentElement.parentElement.hidden=false;
 $("#section-title")?.toggleAttribute("hidden",false);
 $("#search-wrap").hidden=!productView;$("#hero").hidden=view!=="home";
 const closure=catalog.about?.closureAlert,now=new Date(),today=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0"),notice=$("#closure-notice");
 if(productView&&closure?.date===today&&closure.message){notice.hidden=false;notice.innerHTML="<b>⚠️ Aviso importante: hoy estamos cerrados</b><span>"+closure.message+"</span>"}else{notice.hidden=true;notice.textContent=""}
 let title="",kicker="",items=[];
 if(view==="home"){title="Favoritos de la casa";kicker="CAFÉS Y DULCES DESTACADOS";items=products.filter(p=>(typeOfProduct(p)==="coffee"||typeOfProduct(p)==="sweet")&&(p.featured===true||p.bestSeller===true||p.mostOrdered===true));if(!showAll)items=items.slice(0,4)}
 else if(view==="coffee"){title="Todos nuestros cafés";kicker="NUESTRA CARTA DE CAFÉ";items=products.filter(p=>typeOfProduct(p)==="coffee")}
 else if(view==="sweets"){title="Todos nuestros dulces";kicker="ALGO DULCE PARA TI";items=products.filter(p=>typeOfProduct(p)==="sweet")}
 else if(eventView){title="Eventos";kicker="MOMENTOS ESPECIALES"}
 else{title="Sobre nosotros";kicker="CONOCE BUTTERFLY CAFÉ"}
 $("#section-heading").textContent=title;$("#section-kicker").textContent=kicker;$("#all").style.display=view==="home"?"inline-block":"none";$("#all").textContent=showAll?"Ver destacados":"Ver todos →";
 if(productView)$("#products").innerHTML=items.map(productCard).join("")||'<div class="empty">Todavía no hay productos en esta sección. 💜</div>';
 if(eventView){
  const e=catalog.event||{},titleText=String(e.title||"").trim(),winner=String(e.winner||"").trim(),description=String(e.description||"").trim(),videoUrl=String(e.video||"").trim(),poster=String(e.poster||"").trim();
  const video=videoUrl?'<video controls playsinline preload="metadata"'+(poster?' poster="'+poster+'"':"")+' src="'+videoUrl+'"></video>':"";
  const hasContent=titleText||winner||description||videoUrl;
  $("#event-feature").innerHTML=hasContent?'<article class="winner-card"><span class="winner-label">🦋 EVENTO</span>'+(titleText?'<h3>'+titleText+'</h3>':"")+(winner?'<strong>🏆 Ganador: '+winner+'</strong>':"")+(description?'<p>'+description+'</p>':"")+video+'</article>':'<div class="empty">Próximamente anunciaremos nuevos eventos. 💜</div>';
 }
 if(aboutView){
  const a=catalog.about||{},titleText=String(a.title||"").trim(),description=String(a.description||"").trim(),owners=String(a.owners||"").trim(),phone=String(a.phone||"").trim();
  const weekly=a.weeklyHours||{},days=[["monday","Lunes"],["tuesday","Martes"],["wednesday","Miércoles"],["thursday","Jueves"],["friday","Viernes"],["saturday","Sábado"],["sunday","Domingo"]];
  const hasRealHours=days.some(([key])=>{const d=weekly[key]||{};return d.closed===true||(d.open&&d.close)});
  const hours=hasRealHours?'<div class="about-line"><b>🕒 Horario semanal</b><div class="weekly-hours-list">'+days.map(([key,label])=>{const d=weekly[key]||{};if(!(d.closed===true||(d.open&&d.close)))return "";return '<span><b>'+label+'</b>'+(d.closed?"Cerrado":d.open+" – "+d.close)+'</span>'}).join("")+'</div></div>':(a.hours&& !String(a.hours).includes("Horario por definir")?'<div class="about-line"><b>🕒 Horario de apertura</b><span>'+a.hours+'</span></div>':"");
  const socials=(a.socials||[]).filter(s=>s.url).map(s=>'<a class="social-link" href="'+s.url+'" target="_blank" rel="noopener">'+(s.name||"Síguenos")+' ↗</a>').join("");
  const parts=(titleText?'<h3>'+titleText+'</h3>':"")+(description?'<p>'+description+'</p>':"")+hours+(phone?'<div class="about-line"><b>☎️ Contacto</b><a href="tel:'+phone+'">'+phone+'</a></div>':"")+(owners?'<div class="about-line"><b>Propietario(s)</b><span>'+owners+'</span></div>':"")+(socials?'<div class="social-list">'+socials+'</div>':"");
  $("#about-page").innerHTML=parts?'<article class="about-card"><span class="winner-label">🦋 SOBRE NOSOTROS</span>'+parts+'</article>':'<div class="empty">Pronto compartiremos más información sobre nosotros. 💜</div>';
 }
 document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
}
async function load(){try{const r=await fetch(CATALOG_URL+"?v="+Date.now(),{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const next=await r.json();const changed=!!catalog&&String(next.version)!==String(catalog.version);catalog=next;render();if(changed)toast("✓ El catálogo se ha actualizado")}catch(e){if(!catalog)$("#products").innerHTML='<div class="empty">No se pudo cargar el menú. Comprueba tu conexión.</div>';console.error(e)}}
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;showAll=false;render();window.scrollTo({top:0,behavior:"smooth"})});
$("#search").addEventListener("input",()=>render());$("#all").onclick=()=>{showAll=!showAll;render()};load();setInterval(load,60000);
