/* Script de la page acces.html (externe pour la politique de sécurité du contenu). */
(function(){
"use strict";
var E=window.Espace, esc=E.esc, $=function(s){return document.querySelector(s);};
var S=E.requireLogin(); if(!S) return;
if(!S.user.gestion){ location.replace("./"); return; }
var personnes=[], editing=null, delArmed=false;
var INV={organisateur:"Organisateur",contributeur:"Contributeur",lecture:"Lecture",intervenant:"Intervenant"};

E.renderTop({active:"acces"}); E.renderFoot();

function isSelf(p){ var mine=(S.user.emails||[S.user.email]); return p.emails.some(function(e){return mine.indexOf(e)>-1;}); }
function yes(b){ return b?'<span class="yes" aria-label="oui">✓</span>':'<span class="no" aria-label="non">—</span>'; }
function render(){
  if(!personnes.length){ $("#list").innerHTML='<div class="notice"><h4>Personne n\'est inscrit.</h4></div>'; return; }
  var rows=personnes.slice().sort(function(a,b){return a.nom.localeCompare(b.nom,"fr");});
  $("#list").innerHTML='<div class="acc-scroll"><table class="acc"><thead><tr><th>Personne</th><th>Investiture</th><th class="c">Actualités</th><th class="c">Lectures</th><th class="c">Newsletter</th><th class="c">Gestion</th><th></th></tr></thead><tbody>'+
    rows.map(function(p){
      return '<tr class="'+(p.actif?"":"off")+'"><td><div class="nm">'+esc(p.nom)+(isSelf(p)?' <span class="role-pill">vous</span>':'')+'</div><div class="em">'+p.emails.map(esc).join('<br>')+'</div>'+(p.note?'<div style="font-size:12.5px;color:var(--ink-mute);font-style:italic">'+esc(p.note)+'</div>':"")+(p.actif?"":'<div style="font-size:12px;color:var(--cardinal)">Accès désactivé</div>')+'</td>'+
        '<td>'+(p.inv?'<span class="role-pill">'+INV[p.inv]+'</span>':'<span class="no">—</span>')+'</td>'+
        '<td class="c">'+yes(p.site.actualites)+'</td><td class="c">'+yes(p.site.lectures)+'</td><td class="c">'+yes(p.site.newsletter)+'</td><td class="c">'+yes(p.gestion)+'</td>'+
        '<td><button class="btn btn-ghost btn-sm" type="button" data-email="'+esc(p.cle)+'">Modifier</button></td></tr>';
    }).join("")+'</tbody></table></div>';
}
function whenStr(ts){ if(!ts) return ""; var d=new Date(ts); return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})+" "+String(d.getHours()).padStart(2,"0")+"h"+String(d.getMinutes()).padStart(2,"0"); }
var ACT={"acces.deconnecte":"déconnecte partout","connexion":"connexion","refus":"accès refusé","acces.ajoute":"ajoute","acces.modifie":"modifie","acces.supprime":"supprime l'accès de","installation":"installation","rgpd":"RGPD"};
function renderJournal(j){
  $("#journal").innerHTML=j.length?j.map(function(x){return '<li><span class="when">'+esc(whenStr(x.ts))+'</span><span class="what"><b>'+esc(x.qui)+'</b> · '+esc(ACT[x.action]||x.action)+(x.detail?' — '+esc(x.detail):'')+'</span></li>';}).join(""):'<li><span class="when">—</span><span class="what">Rien pour l\'instant.</span></li>';
}
async function load(){
  try{ var out=await E.api("acces.lister"); personnes=out.personnes; render(); renderJournal(out.journal); }
  catch(e){ $("#list").innerHTML='<div class="notice"><h4>Impossible de charger la liste.</h4><p>'+esc(e.message)+'</p></div>'; }
}

var dlg=$("#dlg");
function open(p){
  editing=p||null; delArmed=false;
  $("#dlg-title").textContent=p?"Modifier l'accès":"Ajouter une personne";
  $("#p-nom").value=p?p.nom:""; $("#p-email").value=p?p.emails.join(", "):"";
  $("#p-inv").value=p?p.inv:"";
  $("#p-act").checked=!!(p&&p.site.actualites); $("#p-lec").checked=!!(p&&p.site.lectures); $("#p-nl").checked=!!(p&&p.site.newsletter);
  $("#p-gest").checked=!!(p&&p.gestion); $("#p-actif").checked=p?p.actif:true; $("#p-note").value=p?p.note:"";
  var self=p&&isSelf(p);
  $("#p-gest").disabled=!!self; $("#p-actif").disabled=!!self;
  $("#p-del").hidden=!p||self; $("#p-del").textContent="Supprimer cet accès";
  $("#p-logout").hidden=!p;
  $("#p-err").hidden=true;
  dlg.showModal(); $("#p-nom").focus();
}
$("#btn-add").addEventListener("click",function(){ open(null); });
$("#list").addEventListener("click",function(e){ var b=e.target.closest("button[data-email]"); if(!b) return; var p=personnes.filter(function(x){return x.cle===b.dataset.email;})[0]; if(p) open(p); });
$("#p-cancel").addEventListener("click",function(){ dlg.close(); });
$("#p-logout").addEventListener("click",async function(){
  if(!editing) return;
  var self=isSelf(editing);
  try{
    var out=await E.api("acces.deconnecter",{email:editing.cle});
    dlg.close();
    if(out.vous){ E.clearSession(); location.replace("./"); return; }
    E.toast(out.fermees?(out.fermees+" session"+(out.fermees>1?"s":"")+" fermée"+(out.fermees>1?"s":"")+" : la personne devra se reconnecter."):"Aucune session ouverte pour cette personne.");
    load();
  }catch(err){ $("#p-err").textContent=err.message; $("#p-err").hidden=false; }
});
$("#p-del").addEventListener("click",async function(){
  if(!editing) return;
  if(!delArmed){ delArmed=true; this.textContent="Cliquer à nouveau pour confirmer"; return; }
  var em=editing.cle; dlg.close();
  try{ await E.api("acces.supprimer",{email:em}); E.toast("Accès supprimé"); }catch(err){ E.toast(err.message); }
  load();
});
$("#f").addEventListener("submit",async function(e){
  e.preventDefault();
  var p={nom:$("#p-nom").value.trim(),email:$("#p-email").value.trim(),inv:$("#p-inv").value,
    site:{actualites:$("#p-act").checked,lectures:$("#p-lec").checked,newsletter:$("#p-nl").checked},
    gestion:$("#p-gest").checked,actif:$("#p-actif").checked,note:$("#p-note").value.trim()};
  var ems=p.email.split(/[;,\s]+/).filter(Boolean);
  if(!p.nom||!ems.length||ems.some(function(x){return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);})){ $("#p-err").textContent="Indiquez un nom et des adresses e-mail valides (séparées par une virgule)."; $("#p-err").hidden=false; return; }
  try{
    await E.api("acces.enregistrer",{personne:p,emailOriginal:editing?editing.cle:""});
    dlg.close(); E.toast(editing?"Accès mis à jour":"Personne ajoutée"); load();
  }catch(err){ $("#p-err").textContent=err.message; $("#p-err").hidden=false; }
});
load();
})();
