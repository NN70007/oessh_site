/* Script de la page retraite.html — week-end de formation et de retraite des impétrants (9 et 10 janvier 2027).
   Même fonctionnement que page-investiture.js, avec ses propres onglets dans la feuille (actions « ret.* »)
   et une vue « Programme » (créneaux horaires, intervenants et confirmations). */
(function(){
"use strict";
var E=window.Espace;
var S=E.requireLogin(); if(!S) return;

var POLES=[
  {k:"programme",n:"Programme & intervenants"},{k:"temoignages",n:"Témoignages"},{k:"liturgie",n:"Liturgie"},
  {k:"lieu",n:"Lieu, repas & salles"},{k:"inscriptions",n:"Inscriptions & dossiers"},{k:"com",n:"Communication & invitations"}
];
var DAYS=[{d:"2027-01-09",n:"Samedi 9 janvier"},{d:"2027-01-10",n:"Dimanche 10 janvier"}];
var CST={confirme:"Confirmé",principe:"Accord de principe",aconfirmer:"À confirmer",atrouver:"À trouver"};
var ST={afaire:"À faire",encours:"En cours",fait:"Fait"};
var EVENT_DAY="2027-01-09";
var REFRESH_MS=30000;

var user=S.user, me=user.nom;
var tasks=[], activity=[], jalons=[], personnes=[], programme=[], organisation=[], loaded=false, loadErr="";
var view="ensemble", poleFocus=null, poleFilter="tous", progFilter="tout", editing=null, busy={};
try{ var v=localStorage.getItem("ret27_view"); if(v) view=v; }catch(e){}

function canWrite(){ return user.ret==="organisateur"||user.ret==="contributeur"; }
function isOrg(){ return user.ret==="organisateur"; }
function canEditTask(t){ if(isOrg()) return true; if(user.ret!=="contributeur") return false; return !t.resp.length||t.resp.indexOf(me)>-1; }

var $=function(s,r){return (r||document).querySelector(s);};
var esc=E.esc;
function pad(n){return n<10?"0"+n:""+n;}
function todayStr(){var d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function parseD(s){var p=String(s).split("-");return new Date(+p[0],(+p[1])-1,+p[2]);}
function days(a,b){return Math.round((parseD(b)-parseD(a))/86400000);}
var fmtShort=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"});
var fmtDM=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short"});
function fDate(s){return s?fmtShort.format(parseD(s)):"Sans date";}
function poleName(k){for(var i=0;i<POLES.length;i++) if(POLES[i].k===k) return POLES[i].n; return "Divers";}
function poleIdx(k){for(var i=0;i<POLES.length;i++) if(POLES[i].k===k) return i; return 99;}
function isLate(t){return t.statut!=="fait" && t.echeance && t.echeance<todayStr();}
function isFree(t){return !(t.resp&&t.resp.length);}
function isPending(c){return c.statut==="aconfirmer"||c.statut==="principe"||c.statut==="atrouver";}
function hhmm(h){return h?h.replace(":","h"):"";}
function lastName(p){return p.split(" ").slice(-1)[0];}
function people(){var s={};personnes.forEach(function(p){s[p]=1;});tasks.forEach(function(t){t.resp.forEach(function(p){s[p]=1;});});return Object.keys(s).filter(Boolean).sort(function(a,b){return lastName(a).localeCompare(lastName(b),"fr");});}
function relDue(t){
  if(!t.echeance) return "";
  if(t.statut==="fait") return "terminé";
  var n=days(todayStr(),t.echeance);
  if(n<0) return "en retard de "+(-n)+" j";
  if(n===0) return "aujourd'hui";
  if(n<=31) return "dans "+n+" j";
  return "dans "+Math.round(n/30.4)+" mois";
}
function byDue(a,b){return (a.echeance||"9999").localeCompare(b.echeance||"9999")||poleIdx(a.pole)-poleIdx(b.pole);}
function toast(m){E.toast(m);}

/* ---------- Composants ---------- */
function segHTML(t){
  if(!canEditTask(t)) return '<span class="st-pill '+t.statut+'">'+(t.statut==="fait"?"✓ ":"")+ST[t.statut]+'</span>';
  return '<div class="seg" role="group" aria-label="Où en est-on">'+
    ["afaire","encours","fait"].map(function(s){return '<button type="button" data-act="st" data-id="'+esc(t.id)+'" data-st="'+s+'" class="'+(t.statut===s?"on":"")+'" aria-pressed="'+(t.statut===s)+'">'+(s==="fait"?"✓ ":"")+ST[s]+'</button>';}).join("")+'</div>';
}
function teamHTML(t){
  var eq=t.equipe||[]; if(!eq.length) return "";
  return '<div class="team">'+eq.map(function(m){
    return '<span class="mate">'+esc(m.nom||"Sans nom")+(m.role?' <span class="r">· '+esc(m.role)+'</span>':"")+
      (m.tel?' <span class="tel">'+esc(m.tel)+'</span><button type="button" class="copy" data-act="copy" data-v="'+esc(m.tel)+'" aria-label="Copier le numéro de '+esc(m.nom||"")+'">Copier</button>':' <span class="tel none">téléphone manquant</span>')+
    '</span>';
  }).join("")+'</div>';
}
function taskHTML(t,opts){
  opts=opts||{};
  var late=isLate(t), free=isFree(t);
  var who=free?'<span class="who none">Pas encore de responsable</span>':'<span class="who">Responsable : <b>'+esc(t.resp.join(", "))+'</b></span>';
  var editBtn=canEditTask(t)?'<button type="button" class="icon-btn" data-act="edit" data-id="'+esc(t.id)+'" aria-label="Modifier « '+esc(t.titre)+' »" title="Modifier"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10.5 2.5l3 3L5 14H2v-3z"/><path d="M9 4l3 3"/></svg></button>':'<span></span>';
  return '<div class="task'+(late?" is-late":"")+(t.statut==="fait"?" is-done":"")+'">'+
    segHTML(t)+
    '<div class="t"><div class="title">'+esc(t.titre)+'</div><div class="sub">'+
      (opts.noPole?"":'<span>'+esc(poleName(t.pole))+'</span>')+who+
      (t.note?'<span class="note">'+esc(t.note)+'</span>':"")+
    '</div>'+teamHTML(t)+'</div>'+
    '<div class="due'+(late?" late":"")+'">'+fDate(t.echeance)+'<span class="rel">'+relDue(t)+'</span></div>'+
    editBtn+
  '</div>';
}
function listHTML(arr,empty,opts){
  if(!arr.length) return '<div class="tasks"><div class="empty-row">'+esc(empty)+'</div></div>';
  return '<div class="tasks">'+arr.map(function(t){return taskHTML(t,opts);}).join("")+'</div>';
}
function head(num,label,title,lede){
  return '<div class="section-head"><div class="meta"><div class="num">'+num+'</div><div class="label">'+label+'</div></div><div><h2>'+title+'</h2>'+(lede?'<p class="lede">'+lede+'</p>':"")+'</div></div>';
}
function stateNotice(){
  if(loadErr&&!loaded) return '<div class="notice"><h4>Les tâches n\'ont pas pu être chargées.</h4><p>'+esc(loadErr)+'</p><button class="btn btn-ghost btn-sm" type="button" data-act="reload">Réessayer</button></div>';
  if(!loaded) return '<div class="notice"><h4>Chargement des tâches…</h4><p>Les tâches du week-end de retraite apparaissent dans un instant.</p></div>';
  if(!tasks.length) return '<div class="notice"><h4>'+(user.ret==="intervenant"?"Aucune tâche ne vous est confiée pour l'instant.":"Aucune tâche pour l'instant.")+'</h4>'+(canWrite()?'<p>Ajoutez la première avec le bouton « Nouvelle tâche ».</p><button class="btn btn-primary btn-sm" data-act="new" type="button">+ Nouvelle tâche</button>':'')+'</div>';
  return "";
}
function orgHTML(){
  if(!organisation.length) return "";
  return '<div class="org-line">'+organisation.map(function(o){return '<div><span class="eyebrow">'+esc(o.fonction||"Organisation")+'</span><b>'+esc(o.nom)+'</b></div>';}).join("")+'</div>';
}
function roleNote(){
  if(user.ret==="lecture") return '<p class="readonly-note">Vous consultez le tableau en lecture seule.</p>';
  if(user.ret==="intervenant") return '<p class="readonly-note">Vous voyez les tâches sur lesquelles vous intervenez, avec les contacts de votre équipe.</p>';
  if(user.ret==="contributeur") return '<p class="readonly-note">Vous pouvez mettre à jour les tâches dont vous êtes responsable et prendre en charge les tâches libres.</p>';
  return "";
}

/* ---------- Vues ---------- */
function vEnsemble(){
  var total=tasks.length, done=tasks.filter(function(t){return t.statut==="fait";}).length;
  var doing=tasks.filter(function(t){return t.statut==="encours";}).length;
  var todo=total-done-doing;
  var late=tasks.filter(isLate).length;
  var free=tasks.filter(function(t){return isFree(t)&&t.statut!=="fait";}).length;
  var pct=total?Math.round(done*100/total):0;
  var dleft=Math.max(0,days(todayStr(),EVENT_DAY));
  var pend=programme.filter(function(c){return c.jour!=="notes"&&isPending(c);}).length;
  var C=2*Math.PI*54, off=C*(1-pct/100);
  var in30=new Date();in30.setDate(in30.getDate()+30);
  var l30=in30.getFullYear()+"-"+pad(in30.getMonth()+1)+"-"+pad(in30.getDate());
  var soon=tasks.filter(function(t){return t.statut!=="fait"&&t.echeance&&t.echeance<=l30;}).sort(byDue);
  var notice=stateNotice();

  var h='<section class="block"><div class="container">'+
    head("— 9 & 10 janvier 2027","Retraite","Formation et retraite des impétrants.","Un week-end de formation, de prière et de témoignages à la Maison d\'Accueil des Franciscaines, 50 avenue Gaston Diderich, à Luxembourg.")+orgHTML()+roleNote()+
    '<div class="hero-grid">'+
      '<div class="hero-cell"><div class="eyebrow">Compte à rebours</div><div class="countdown"><span class="n">'+dleft+'</span><span class="u">jours</span></div><p class="cap">avant la <strong>messe d\'ouverture</strong>, samedi 9 janvier 2027 à 9h00, chez les Sœurs franciscaines.</p></div>'+
      '<div class="hero-cell"><div class="eyebrow">Avancement'+(user.ret==="intervenant"?" de vos tâches":" général")+'</div><div class="ring-wrap">'+
        '<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="'+pct+' % des tâches faites"><circle class="track" cx="60" cy="60" r="54"/><circle class="val" cx="60" cy="60" r="54" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/><text x="60" y="64" text-anchor="middle">'+pct+'%</text><text class="small" x="60" y="82" text-anchor="middle">FAIT</text></svg>'+
        '<p class="cap"><strong>'+done+'</strong> tâche'+(done>1?"s":"")+' faite'+(done>1?"s":"")+' sur <strong>'+total+'</strong>.<br>'+doing+' en cours, '+todo+' encore à faire.</p></div></div>'+
      '<div class="hero-cell counters-cell"><div class="eyebrow">À regarder en priorité</div><div class="counters">'+
        '<button class="counter" type="button" data-act="tab" data-tab="poles" data-filter="retard"><span class="k"><i class="dot late"></i>En retard</span><span class="v">'+late+'</span></button>'+
        '<button class="counter" type="button" data-act="tab" data-tab="qui"><span class="k"><i class="dot free"></i>Sans responsable</span><span class="v">'+free+'</span></button>'+
        '<button class="counter" type="button" data-act="tab" data-tab="poles" data-filter="encours"><span class="k"><i class="dot doing"></i>En cours</span><span class="v">'+doing+'</span></button>'+
        '<button class="counter" type="button" data-act="tab" data-tab="programme" data-pfilter="attente"><span class="k"><i class="dot todo"></i>Intervenants à confirmer</span><span class="v">'+pend+'</span></button>'+
      '</div></div>'+
    '</div></div></section>';

  if(notice){ return h+'<section class="block"><div class="container">'+notice+'</div></section>'; }

  h+='<section class="block paper"><div class="container"><div class="subhead"><h3>Dans les 30 prochains jours</h3><span class="eyebrow">'+soon.length+' tâche'+(soon.length>1?"s":"")+' · retards compris</span></div>'+
     listHTML(soon,"Rien d'urgent dans les 30 prochains jours.")+'</div></section>';

  h+='<section class="block"><div class="container"><div class="subhead"><h3>Les pôles</h3><span class="eyebrow">Cliquer sur un pôle pour voir le détail</span></div><div class="poles">'+
    POLES.map(function(p,i){
      var ts=tasks.filter(function(t){return t.pole===p.k;});
      var d=ts.filter(function(t){return t.statut==="fait";}).length;
      var lt=ts.filter(isLate).length, fr=ts.filter(function(t){return isFree(t)&&t.statut!=="fait";}).length;
      var pc=ts.length?Math.round(d*100/ts.length):0;
      var alert=(lt||fr)?'<div class="alert">'+(lt?'<span>● '+lt+' en retard</span>':"")+(fr?'<span>○ '+fr+' sans responsable</span>':"")+'</div>':'<div class="calm">Tout est attribué, rien en retard</div>';
      return '<button class="pole" type="button" data-act="pole" data-pole="'+p.k+'"><span class="pn">— '+pad(i+1)+'</span><h4>'+esc(p.n)+'</h4><div class="bar"><i class="'+(pc===100?"ok":"")+'" style="width:'+pc+'%"></i></div><div class="stats"><span class="mono">'+d+' / '+ts.length+' faites</span><span>'+pc+' %</span></div>'+alert+'</button>';
    }).join("")+
    '<div class="pole" style="background:var(--white)"><span class="pn">— Mode d\'emploi</span><h4>Comment s\'en servir</h4><p style="font-size:13px;color:var(--ink-soft);line-height:1.55">Pour chaque tâche, cliquez sur <b>À faire</b>, <b>En cours</b> ou <b>Fait</b>. Le crayon permet d\'ajouter une note, des intervenants ou de changer la date. Le tableau se met à jour tout seul toutes les 30 secondes.</p></div>'+
  '</div></div></section>';

  var tdy=todayStr(), nextIdx=-1;
  for(var i=0;i<jalons.length;i++){ if(jalons[i].d>=tdy){nextIdx=i;break;} }
  h+='<section class="block paper"><div class="container"><div class="two">'+
    '<div><div class="subhead"><h3>Les grandes étapes</h3><span class="eyebrow">Jalons du Conseil</span></div><div>'+
      jalons.map(function(j,i){var dd=parseD(j.d);return '<div class="cal-row'+(j.d<tdy?" past":"")+(i===nextIdx?" next":"")+(j.key?" key":"")+'"><div class="date">'+pad(dd.getDate())+' <span class="month">'+fmtDM.format(dd).split(" ").slice(1).join(" ").replace(".","").toUpperCase()+'</span><br>'+dd.getFullYear()+'</div><div><div class="ev">'+esc(j.t)+'</div><div class="where">'+esc(j.w)+'</div></div></div>';}).join("")+
    '</div></div>'+
    (user.ret==="intervenant"?'<div></div>':'<div class="feed"><div class="subhead" style="padding-top:0"><h3>Dernières nouvelles</h3><span class="eyebrow">Qui a fait quoi</span></div><ul>'+
      (activity.length?activity.slice(0,12).map(function(a){return '<li><span class="when">'+esc(whenStr(a.ts))+'</span><span class="what">'+(a.qui?'<b>'+esc(a.qui)+'</b> · ':"")+esc(a.texte)+'</span></li>';}).join(""):'<li><span class="when">—</span><span class="what">Les mises à jour du Conseil s\'afficheront ici.</span></li>')+
    '</ul></div>')+
  '</div></div></section>';
  return h;
}
function whenStr(ts){
  if(!ts) return "";
  var d=new Date(ts), n=new Date();
  if(d.toDateString()===n.toDateString()) return "auj. "+pad(d.getHours())+"h"+pad(d.getMinutes());
  return fmtDM.format(d).replace(".","");
}

function vMes(){
  var h='<section class="block"><div class="container">';
  var notice=stateNotice();
  var mine=tasks.filter(function(t){return t.resp.indexOf(me)>-1;});
  var open=mine.filter(function(t){return t.statut!=="fait";}).sort(byDue);
  var late=open.filter(isLate), rest=open.filter(function(t){return !isLate(t);});
  var done=mine.filter(function(t){return t.statut==="fait";});
  var part=tasks.filter(function(t){return t.resp.indexOf(me)<0&&(t.equipe||[]).some(function(m){return m.nom===me||(m.email&&(user.emails||[user.email]).indexOf(String(m.email).toLowerCase())>-1);});}).sort(byDue);
  h+=head("— Mes tâches",esc(me),"Bonjour, "+esc(me.split(" ")[0])+".", open.length?("Vous êtes responsable de "+open.length+" tâche"+(open.length>1?"s":"")+" à suivre"+(late.length?(", dont "+late.length+" en retard."):".")):(part.length?"Voici les tâches sur lesquelles vous intervenez.":"Rien en attente de votre côté. Merci !"));
  if(notice){ return h+notice+'</div></section>'; }
  if(late.length) h+='<div class="subhead"><h3 style="color:var(--cardinal)">En retard</h3></div>'+listHTML(late,"")+'<div style="height:32px"></div>';
  if(mine.length||user.ret!=="intervenant") h+='<div class="subhead"><h3>À suivre</h3><span class="eyebrow">Par date</span></div>'+listHTML(rest,"Aucune tâche en attente.")+'<div style="height:32px"></div>';
  if(part.length) h+='<div class="subhead"><h3>J\'interviens sur</h3><span class="eyebrow">Comme intervenant</span></div>'+listHTML(part,"")+'<div style="height:32px"></div>';
  if(mine.length||user.ret!=="intervenant") h+='<div class="subhead"><h3>Déjà fait</h3><span class="eyebrow">'+done.length+'</span></div>'+listHTML(done,"Rien de terminé pour l'instant.");
  return h+'</div></section>';
}

function vPoles(){
  var h='<section class="block"><div class="container">'+head("— Par pôle","Toutes les tâches","Toutes les tâches, pôle par pôle.","Chaque pôle regroupe ce qui relève d'un même domaine. Les filtres permettent de ne garder que l'essentiel.");
  var notice=stateNotice(); if(notice) return h+notice+'</div></section>';
  var F=[["tous","Toutes"],["afaire","À faire"],["encours","En cours"],["retard","En retard"],["libre","Sans responsable"],["fait","Faites"]];
  h+='<div class="filters" role="group" aria-label="Filtrer">'+F.map(function(f){return '<button type="button" class="chip'+(poleFilter===f[0]?" on":"")+'" data-act="filter" data-filter="'+f[0]+'">'+f[1]+'</button>';}).join("")+'</div>';
  function keep(t){switch(poleFilter){case"afaire":return t.statut==="afaire";case"encours":return t.statut==="encours";case"fait":return t.statut==="fait";case"retard":return isLate(t);case"libre":return isFree(t)&&t.statut!=="fait";default:return true;}}
  POLES.forEach(function(p,i){
    var all=tasks.filter(function(t){return t.pole===p.k;});
    if(!all.length&&user.ret==="intervenant") return;
    var ts=all.filter(keep).sort(function(a,b){return (a.statut==="fait")-(b.statut==="fait")||byDue(a,b);});
    var d=all.filter(function(t){return t.statut==="fait";}).length;
    h+='<div class="pole-block" id="pole-'+p.k+'"><div class="ph"><h3><span class="mono" style="color:var(--gold);font-size:13px;margin-right:12px">— '+pad(i+1)+'</span>'+esc(p.n)+'</h3><span class="mono">'+d+' / '+all.length+' faites</span></div>'+listHTML(ts,poleFilter==="tous"?"Aucune tâche dans ce pôle.":"Aucune tâche ne correspond à ce filtre.",{noPole:true})+'</div>';
  });
  return h+'</div></section>';
}

function vContacts(){
  var h='<section class="block"><div class="container">'+head("— Équipes & contacts","Qui fait quoi","Les équipes, tâche par tâche.","Pour chaque tâche : le responsable qui pilote, puis les intervenants qui l\'exécutent, avec leur téléphone. C\'est la page à garder sous la main le jour J.");
  var notice=stateNotice(); if(notice) return h+notice+'</div></section>';
  var withTeam=tasks.filter(function(t){return (t.equipe||[]).length;});
  var nTel=0,nMiss=0; withTeam.forEach(function(t){t.equipe.forEach(function(m){if(m.tel)nTel++;else nMiss++;});});
  h+='<p style="font-size:14px;color:var(--ink-soft);margin-bottom:24px">'+withTeam.length+' tâche'+(withTeam.length>1?"s":"")+' avec une équipe · '+(nTel+nMiss)+' intervenant'+((nTel+nMiss)>1?"s":"")+(nMiss?' · <span style="color:var(--cardinal)">'+nMiss+' sans téléphone</span>':"")+'</p>';
  if(!withTeam.length){
    return h+'<div class="notice"><h4>Aucune équipe enregistrée pour l\'instant.</h4><p>Ouvrez une tâche avec le crayon, puis « Ajouter un intervenant » : nom, rôle (chauffeur, accueil, photographe…) et téléphone. Les équipes apparaîtront ici, regroupées par pôle.</p></div></div></section>';
  }
  POLES.forEach(function(p){
    var ts=withTeam.filter(function(t){return t.pole===p.k;}).sort(byDue);
    if(!ts.length) return;
    h+='<div class="subhead" style="margin-top:12px"><h3>'+esc(p.n)+'</h3></div>';
    ts.forEach(function(t){
      h+='<div class="contact-card"><div class="cc-head"><div><div class="pn">'+fDate(t.echeance)+'</div><h4>'+esc(t.titre)+'</h4></div>'+
        '<div class="lead">Responsable<b>'+(isFree(t)?'<span style="color:var(--cardinal)">à désigner</span>':esc(t.resp.join(", ")))+'</b></div></div>'+
        '<div class="cc-scroll"><table class="ctable"><thead><tr><th>Intervenant</th><th>Rôle</th><th>Téléphone</th></tr></thead><tbody>'+
        t.equipe.map(function(m){return '<tr><td>'+esc(m.nom||"Sans nom")+'</td><td class="r">'+esc(m.role||"—")+'</td><td class="tel">'+(m.tel?'<span>'+esc(m.tel)+'</span> <button type="button" class="copy" data-act="copy" data-v="'+esc(m.tel)+'">Copier</button>':'<em style="color:var(--cardinal);font-family:var(--sans)">à compléter</em>')+'</td></tr>';}).join("")+
        '</tbody></table></div></div>';
    });
  });
  return h+'</div></section>';
}

function slotHTML(c){
  var pill=c.statut?'<span class="cs-pill '+c.statut+'">'+(c.statut==="confirme"?"✓ ":"")+CST[c.statut]+'</span>':'<span></span>';
  var edit=isOrg()?'<button type="button" class="icon-btn" data-act="slot" data-id="'+esc(c.id)+'" aria-label="Modifier « '+esc(c.titre)+' »" title="Modifier"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M10.5 2.5l3 3L5 14H2v-3z"/><path d="M9 4l3 3"/></svg></button>':'';
  return '<div class="slot'+(isPending(c)?" is-pending":"")+'">'+
    '<div class="hr">'+esc(hhmm(c.debut)||"—")+(c.fin?'<span>'+esc(hhmm(c.fin))+'</span>':"")+'</div>'+
    '<div class="t"><div class="title">'+esc(c.titre)+'</div>'+
      (c.qui?'<div class="by">'+esc(c.qui)+'</div>':"")+
      (c.note?'<div class="note">'+esc(c.note)+'</div>':"")+
    '</div>'+pill+edit+'</div>';
}
function vProgramme(){
  var h='<section class="block"><div class="container">'+head("— 9 & 10 janvier 2027","Programme","Le programme du week-end.","Chaque créneau indique l\'intervenant et l\'état de sa confirmation. Les créneaux encore incertains sont signalés en rouge.");
  if(!loaded) return h+stateNotice()+'</div></section>';
  var slots=programme.filter(function(c){return c.jour!=="notes";});
  var notes=programme.filter(function(c){return c.jour==="notes";});
  var conf=slots.filter(function(c){return c.statut==="confirme";}).length;
  var pend=slots.filter(isPending).length;
  h+='<div class="prog-bar"><div class="filters" role="group" aria-label="Filtrer le programme">'+
    [["tout","Tout le programme"],["attente","À confirmer seulement"]].map(function(f){return '<button type="button" class="chip'+(progFilter===f[0]?" on":"")+'" data-act="pfilter" data-pfilter="'+f[0]+'">'+f[1]+(f[0]==="attente"&&pend?" · "+pend:"")+'</button>';}).join("")+
    '</div><span class="eyebrow">'+slots.length+' créneau'+(slots.length>1?"x":"")+' · '+conf+' confirmé'+(conf>1?"s":"")+' · '+pend+' en attente</span></div>';
  if(!slots.length&&!notes.length){
    return h+'<div class="notice"><h4>Le programme n\'est pas encore saisi.</h4>'+(isOrg()?'<p>Ajoutez le premier créneau, ou importez le programme dans la feuille.</p><button class="btn btn-primary btn-sm" type="button" data-act="slot-new" data-jour="'+DAYS[0].d+'">+ Ajouter un créneau</button>':'<p>Il apparaîtra ici dès que les organisateurs l\'auront saisi.</p>')+'</div></div></section>';
  }
  var others=slots.filter(function(c){return !DAYS.some(function(d){return d.d===c.jour;});});
  var days=DAYS.concat(others.length?[{d:"autre",n:"Autre date"}]:[]);
  h+='<div class="prog-days">'+days.map(function(d){
    var list=slots.filter(function(c){return d.d==="autre"?others.indexOf(c)>-1:c.jour===d.d;})
      .filter(function(c){return progFilter!=="attente"||isPending(c);})
      .sort(function(a,b){return (a.debut||"99").localeCompare(b.debut||"99");});
    return '<div class="prog-day"><div class="subhead"><h3>'+esc(d.n)+'</h3>'+(isOrg()&&d.d!=="autre"?'<button class="btn btn-ghost btn-sm" type="button" data-act="slot-new" data-jour="'+d.d+'">+ Créneau</button>':'')+'</div>'+
      '<div class="slots">'+(list.length?list.map(slotHTML).join(""):'<div class="empty-row">'+(progFilter==="attente"?"Tout est confirmé ce jour-là.":"Aucun créneau.")+'</div>')+'</div></div>';
  }).join("")+'</div>';
  if(notes.length||isOrg()){
    h+='<div class="prog-notes"><div class="subhead"><h3>À retenir</h3>'+(isOrg()?'<button class="btn btn-ghost btn-sm" type="button" data-act="slot-new" data-jour="notes">+ Note</button>':'<span class="eyebrow">Remarques du Conseil</span>')+'</div>'+
      (notes.length?'<ul>'+notes.map(function(c){return '<li><span>'+esc(c.titre)+(c.note?' <em>'+esc(c.note)+'</em>':"")+'</span>'+(isOrg()?'<button type="button" class="icon-btn" data-act="slot" data-id="'+esc(c.id)+'" aria-label="Modifier cette note" title="Modifier">✎</button>':"")+'</li>';}).join("")+'</ul>':'<p class="empty-row">Aucune remarque.</p>')+'</div>';
  }
  return h+'</div></section>';
}

function vQui(){
  var h='<section class="block"><div class="container">'+head("— Qui s'en charge ?","À attribuer","Ces tâches attendent quelqu'un.",canWrite()?"Un clic sur « Je m'en occupe » vous inscrit comme responsable."+(isOrg()?" Vous pouvez aussi désigner un confrère ou une consœur.":""):"Ces tâches n'ont pas encore de responsable.");
  var notice=stateNotice(); if(notice) return h+notice+'</div></section>';
  var fr=tasks.filter(function(t){return isFree(t)&&t.statut!=="fait";}).sort(byDue);
  if(!fr.length) return h+'<div class="notice"><h4>Toutes les tâches ont un responsable.</h4><p>Merci à chacun.</p></div></div></section>';
  var opts=people().map(function(p){return '<option value="'+esc(p)+'">'+esc(p)+'</option>';}).join("");
  h+='<div class="free-grid">'+fr.map(function(t){
    return '<div class="free-card"><div class="pn">'+esc(poleName(t.pole))+'</div><h4>'+esc(t.titre)+'</h4>'+(t.note?'<p class="note">'+esc(t.note)+'</p>':"")+
      '<div class="due'+(isLate(t)?" late":"")+'" style="text-align:left">À faire pour le '+fDate(t.echeance)+' <span class="rel" style="display:inline;margin-left:6px">'+relDue(t)+'</span></div>'+
      '<div class="row">'+(canWrite()?'<button type="button" class="btn btn-primary btn-sm" data-act="take" data-id="'+esc(t.id)+'">Je m\'en occupe</button>':'')+
      (isOrg()?'<select aria-label="Attribuer à" data-act="assign" data-id="'+esc(t.id)+'" style="border:1px solid var(--line);padding:8px;border-radius:2px;font-size:12.5px;background:var(--white);max-width:180px"><option value="">Attribuer à…</option>'+opts+'</select>':'')+'</div></div>';
  }).join("")+'</div>';
  return h+'</div></section>';
}

/* ---------- Rendu ---------- */
var TABS=[["ensemble","Vue d'ensemble"],["programme","Programme"],["mes","Mes tâches"],["poles","Par pôle"],["contacts","Équipes & contacts"],["qui","Qui s'en charge ?"]];
function renderChrome(){
  var fr=tasks.filter(function(t){return isFree(t)&&t.statut!=="fait";}).length;
  var mineN=tasks.filter(function(t){return t.resp.indexOf(me)>-1&&t.statut!=="fait";}).length;
  var tabs=TABS.filter(function(x){return !(user.ret==="intervenant"&&x[0]==="qui");}).map(function(x){
    var pend=programme.filter(function(c){return c.jour!=="notes"&&isPending(c);}).length;
    var badge=x[0]==="programme"&&pend?' <span class="badge">'+pend+'</span>':x[0]==="qui"&&fr?' <span class="badge">'+fr+'</span>':(x[0]==="mes"&&mineN?' <span class="badge quiet">'+mineN+'</span>':"");
    return '<button class="nav-tab'+(x[0]===view?" active":"")+'" type="button" data-act="tab" data-tab="'+x[0]+'" role="tab" aria-selected="'+(x[0]===view)+'">'+x[1]+badge+'</button>';
  }).join("");
  E.renderTop({section:"Week-end de retraite",tabs:tabs,cta:canWrite()?'<button class="btn btn-primary" type="button" data-act="new"><span class="arr">+</span><span class="lbl">Nouvelle tâche</span></button>':''});
}
function render(){
  var sx=window.scrollY;
  var html={ensemble:vEnsemble,programme:vProgramme,mes:vMes,poles:vPoles,contacts:vContacts,qui:vQui}[view]||vEnsemble;
  var m=$("#view"); var changed=m.dataset.view!==view;
  m.innerHTML='<div class="view">'+html()+'</div>';
  if(!changed){ m.firstChild.style.animation="none"; window.scrollTo(0,sx); }
  m.dataset.view=view;
  renderChrome();
  if(poleFocus){ var el=document.getElementById("pole-"+poleFocus); poleFocus=null; if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); }
}
function go(v){ view=v; try{localStorage.setItem("ret27_view",v);}catch(e){} render(); window.scrollTo({top:0}); }

/* ---------- Données ---------- */
var loading=false;
async function load(quiet){
  if(loading) return; loading=true;
  try{
    var out=await E.api("ret.charger");
    tasks=out.taches; activity=out.activite; jalons=out.jalons; personnes=out.personnes; programme=out.programme||[]; organisation=out.organisation||[];
    user=out.user; me=user.nom; loaded=true; loadErr="";
    if(!user.ret){ location.replace("./"); return; }
  }catch(e){
    if(e&&e.code==="droits"){ location.replace("./"); return; }
    loadErr=e.message; if(!quiet) toast(e.message);
  }finally{ loading=false; }
  if(!dialogOpen()) render();
}
function dialogOpen(){ return $("#dlg").open||$("#dlg-c").open; }
setInterval(function(){ if(document.visibilityState==="visible"&&!dialogOpen()&&!Object.keys(busy).length) load(true); },REFRESH_MS);
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="visible") load(true); });

function byId(id){for(var i=0;i<tasks.length;i++) if(tasks[i].id===id) return tasks[i]; return null;}
async function call(action,data,okMsg){
  try{ await E.api(action,data); if(okMsg) toast(okMsg); }
  catch(e){ toast(e.message); }
  await load(true);
}
async function setStatus(id,st){
  var t=byId(id); if(!t||t.statut===st||busy[id]) return;
  busy[id]=1; t.statut=st; render();               // affichage immédiat
  await call("ret.statut",{id:id,statut:st},"Enregistré");
  delete busy[id];
}
async function assign(id,p){
  var t=byId(id); if(!t||!p||busy[id]) return;
  busy[id]=1;
  await call("ret.prendre",{id:id,nom:p},p===me?"Vous êtes responsable de cette tâche":"Tâche attribuée à "+p);
  delete busy[id];
}

/* ---------- Fenêtre d'édition ---------- */
var dlg=$("#dlg"), fStatut="afaire", delArmed=false, crewSeq=0;
function openEditor(id){
  editing=id?byId(id):null;
  if(id&&!editing) return;
  if(editing&&!canEditTask(editing)) return;
  if(!editing&&!canWrite()) return;
  var t=editing||{titre:"",pole:"programme",echeance:"",statut:"afaire",resp:[me],equipe:[],note:""};
  $("#dlg-title").textContent=editing?"Modifier la tâche":"Nouvelle tâche";
  $("#dlg-eyebrow").textContent=editing?poleName(t.pole):"Week-end de retraite";
  $("#f-titre").value=t.titre; $("#f-echeance").value=t.echeance||""; $("#f-note").value=t.note||""; $("#f-autre").value="";
  $("#f-pole").innerHTML=POLES.map(function(p){return '<option value="'+p.k+'"'+(p.k===t.pole?" selected":"")+'>'+esc(p.n)+'</option>';}).join("");
  // Seul un organisateur choisit librement le responsable.
  $("#f-resp-field").hidden=!isOrg();
  $("#f-people").innerHTML=people().map(function(p,i){return '<label><input type="checkbox" id="fp-'+i+'" value="'+esc(p)+'"'+(t.resp.indexOf(p)>-1?" checked":"")+'>'+esc(p)+'</label>';}).join("");
  crewSeq=0; $("#f-crew").innerHTML="";
  (t.equipe||[]).forEach(function(m){addCrewRow(m);});
  paintCrewEmpty();
  fStatut=t.statut||"afaire"; paintSeg();
  delArmed=false; $("#f-del").textContent="Supprimer cette tâche"; $("#f-del").hidden=!(editing&&isOrg());
  if(typeof dlg.showModal==="function") dlg.showModal(); else dlg.setAttribute("open","");
  $("#f-titre").focus();
}
function addCrewRow(m){
  m=m||{}; var i=crewSeq++;
  var row=document.createElement("div"); row.className="crew-row";
  row.innerHTML='<input type="text" class="c-nom" id="crew-nom-'+i+'" placeholder="Prénom Nom" aria-label="Nom de l\'intervenant" maxlength="80" value="'+esc(m.nom||"")+'">'+
    '<input type="text" class="c-role" id="crew-role-'+i+'" placeholder="Rôle (ex. chauffeur)" aria-label="Rôle" maxlength="60" value="'+esc(m.role||"")+'">'+
    '<input type="tel" class="c-tel" id="crew-tel-'+i+'" placeholder="+352 …" aria-label="Téléphone" maxlength="30" value="'+esc(m.tel||"")+'">'+
    '<input type="hidden" class="c-email" value="'+esc(m.email||"")+'">'+
    '<button type="button" class="icon-btn c-del" aria-label="Retirer cet intervenant" title="Retirer">✕</button>';
  $("#f-crew").appendChild(row);
  return row;
}
function paintCrewEmpty(){
  var box=$("#f-crew"), has=box.querySelector(".crew-row"), em=box.querySelector(".crew-empty");
  if(!has&&!em){ var p=document.createElement("p"); p.className="crew-empty"; p.textContent="Aucun intervenant pour l’instant."; box.appendChild(p); }
  if(has&&em) em.remove();
}
function readCrew(){
  return [].slice.call(document.querySelectorAll("#f-crew .crew-row")).map(function(r){
    return {nom:r.querySelector(".c-nom").value.trim(),role:r.querySelector(".c-role").value.trim(),tel:r.querySelector(".c-tel").value.trim(),email:r.querySelector(".c-email").value.trim()};
  }).filter(function(m){return m.nom||m.tel;});
}
$("#f-add-mate").addEventListener("click",function(){ var r=addCrewRow({}); paintCrewEmpty(); r.querySelector(".c-nom").focus(); });
$("#f-crew").addEventListener("click",function(e){ var b=e.target.closest(".c-del"); if(b){ b.closest(".crew-row").remove(); paintCrewEmpty(); } });
function paintSeg(){ document.querySelectorAll("#f-statut button").forEach(function(b){var on=b.dataset.st===fStatut;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);}); }
function closeEditor(){ if(dlg.open) dlg.close(); editing=null; }
$("#f-statut").addEventListener("click",function(e){var b=e.target.closest("button");if(b){fStatut=b.dataset.st;paintSeg();}});
$("#f-cancel").addEventListener("click",closeEditor);
$("#f-del").addEventListener("click",async function(){
  if(!editing) return;
  if(!delArmed){ delArmed=true; this.textContent="Cliquer à nouveau pour confirmer la suppression"; return; }
  var t=editing; closeEditor();
  await call("ret.supprimer",{id:t.id},"Tâche supprimée");
});
$("#dlg-form").addEventListener("submit",async function(e){
  e.preventDefault();
  var titre=$("#f-titre").value.trim(); if(!titre){ $("#f-titre").focus(); return; }
  var resp;
  if(isOrg()){
    resp=[].slice.call(document.querySelectorAll("#f-people input:checked")).map(function(i){return i.value;});
    var autre=$("#f-autre").value.trim(); if(autre&&resp.indexOf(autre)<0) resp.push(autre);
  } else { resp=editing?editing.resp:[me]; }
  var data={titre:titre,pole:$("#f-pole").value,echeance:$("#f-echeance").value||"",statut:fStatut,resp:resp,equipe:readCrew(),note:$("#f-note").value.trim()};
  if(editing) data.id=editing.id;
  var wasNew=!editing;
  closeEditor();
  await call("ret.enregistrer",{tache:data},wasNew?"Tâche ajoutée":"Enregistré");
});
dlg.addEventListener("close",function(){ render(); });

/* ---------- Fenêtre d'édition d'un créneau du programme (organisateurs) ---------- */
var dlgC=$("#dlg-c"), cStatut="", cEditing=null, cDelArmed=false;
function openSlot(id,jour){
  if(!isOrg()) return;
  cEditing=id?programme.filter(function(c){return c.id===id;})[0]||null:null;
  if(id&&!cEditing) return;
  var c=cEditing||{jour:jour||DAYS[0].d,debut:"",fin:"",titre:"",qui:"",statut:jour==="notes"?"":"aconfirmer",note:""};
  $("#c-title").textContent=cEditing?(c.jour==="notes"?"Modifier la note":"Modifier le créneau"):(c.jour==="notes"?"Nouvelle note":"Nouveau créneau");
  $("#c-jour").innerHTML=DAYS.map(function(d){return '<option value="'+d.d+'">'+esc(d.n)+'</option>';}).join("")+'<option value="notes">À retenir (remarque)</option>';
  $("#c-jour").value=DAYS.some(function(d){return d.d===c.jour;})||c.jour==="notes"?c.jour:DAYS[0].d;
  $("#c-debut").value=c.debut||""; $("#c-fin").value=c.fin||"";
  $("#c-titre").value=c.titre||""; $("#c-qui").value=c.qui||""; $("#c-note").value=c.note||"";
  cStatut=c.statut||""; paintCSeg(); paintCJour();
  cDelArmed=false; $("#c-del").textContent="Supprimer"; $("#c-del").hidden=!cEditing;
  if(typeof dlgC.showModal==="function") dlgC.showModal(); else dlgC.setAttribute("open","");
  $("#c-titre").focus();
}
function paintCSeg(){ document.querySelectorAll("#c-statut button").forEach(function(b){var on=b.dataset.cs===cStatut;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);}); }
function paintCJour(){ var n=$("#c-jour").value==="notes"; $("#c-heures").hidden=n; $("#c-qui-field").hidden=n; $("#c-statut-field").hidden=n; }
function closeSlot(){ if(dlgC.open) dlgC.close(); cEditing=null; }
$("#c-jour").addEventListener("change",paintCJour);
$("#c-statut").addEventListener("click",function(e){var b=e.target.closest("button");if(b){cStatut=b.dataset.cs;paintCSeg();}});
$("#c-cancel").addEventListener("click",closeSlot);
$("#c-del").addEventListener("click",async function(){
  if(!cEditing) return;
  if(!cDelArmed){ cDelArmed=true; this.textContent="Cliquer à nouveau pour confirmer"; return; }
  var c=cEditing; closeSlot();
  await call("ret.creneauSupprimer",{id:c.id},"Retiré du programme");
});
$("#c-form").addEventListener("submit",async function(e){
  e.preventDefault();
  var titre=$("#c-titre").value.trim(); if(!titre){ $("#c-titre").focus(); return; }
  var note=$("#c-jour").value==="notes";
  var data={jour:$("#c-jour").value,debut:note?"":$("#c-debut").value,fin:note?"":$("#c-fin").value,titre:titre,qui:note?"":$("#c-qui").value.trim(),statut:note?"":cStatut,note:$("#c-note").value.trim()};
  if(cEditing) data.id=cEditing.id;
  var wasNew=!cEditing;
  closeSlot();
  await call("ret.creneau",{creneau:data},wasNew?"Ajouté au programme":"Programme mis à jour");
});
dlgC.addEventListener("close",function(){ render(); });

/* ---------- Événements ---------- */
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-act]"); if(!b||b.tagName==="SELECT") return;
  var a=b.dataset.act;
  if(a==="tab"){ if(b.dataset.filter) poleFilter=b.dataset.filter; else if(b.dataset.tab==="poles") poleFilter="tous"; if(b.dataset.tab==="programme") progFilter=b.dataset.pfilter||"tout"; go(b.dataset.tab); }
  else if(a==="pfilter"){ progFilter=b.dataset.pfilter; render(); }
  else if(a==="slot") openSlot(b.dataset.id);
  else if(a==="slot-new") openSlot(null,b.dataset.jour);
  else if(a==="st") setStatus(b.dataset.id,b.dataset.st);
  else if(a==="edit") openEditor(b.dataset.id);
  else if(a==="new") openEditor(null);
  else if(a==="pole"){ poleFilter="tous"; poleFocus=b.dataset.pole; view="poles"; try{localStorage.setItem("ret27_view","poles");}catch(x){} render(); }
  else if(a==="filter"){ poleFilter=b.dataset.filter; render(); }
  else if(a==="take") assign(b.dataset.id,me);
  else if(a==="reload") load(false);
  else if(a==="copy"){
    var v=b.dataset.v;
    try{ navigator.clipboard.writeText(v).then(function(){toast("Numéro copié : "+v);},function(){toast("Sélectionnez le numéro pour le copier.");}); }
    catch(x){ toast("Sélectionnez le numéro pour le copier."); }
  }
});
document.addEventListener("change",function(e){
  var s=e.target;
  if(s.dataset&&s.dataset.act==="assign"&&s.value) assign(s.dataset.id,s.value);
});

E.renderFoot();
render();
load(false);
})();
