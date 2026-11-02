/* Programme imprimable du week-end de retraite : construit à partir des créneaux de la page, dans leur état actuel.
   Textes du programme imprimé (titrePub, quiPub) s'ils sont renseignés, sinon intitulé et intervenant. */
(function(){
"use strict";
var E=window.Espace, S=E.requireLogin(); if(!S) return;
var esc=E.esc;
var JOURS=[{d:"2027-01-09",n:"Samedi 9 janvier 2027"},{d:"2027-01-10",n:"Dimanche 10 janvier 2027"}];
function hh(h){return h?h.replace(":","h"):"";}
var fmt=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"});
document.getElementById("btn-imprimer").addEventListener("click",function(){ window.print(); });
E.api("ret.charger").then(function(out){
  var auj=new Date(), ed=fmt.format(auj).replace(/^1 /,"1er ");
  var iso=auj.getFullYear()+"-"+("0"+(auj.getMonth()+1)).slice(-2)+"-"+("0"+auj.getDate()).slice(-2);
  document.title="Programme week-end des candidats - édition du "+iso;
  var slots=(out.programme||[]).filter(function(c){return c.jour!=="notes";});
  var h='<img class="entete" src="../assets/email/entete-lieutenance.png" alt="">'+
    '<p class="ordre">Ordre Équestre du Saint-Sépulcre de Jérusalem<small>Lieutenance pour le Luxembourg</small></p>'+
    '<h1>Week-end de formation et de retraite des candidats</h1>'+
    '<p class="lieu">Samedi 9 et dimanche 10 janvier 2027</p>'+
    '<p class="lieu">Maison d\'Accueil des Sœurs Franciscaines, 50, avenue Gaston Diderich, Luxembourg</p>'+
    '<p class="edition">Programme · édition du '+esc(ed)+'</p>';
  JOURS.forEach(function(j){
    var l=slots.filter(function(c){return c.jour===j.d;}).sort(function(a,b){return (a.debut||"99").localeCompare(b.debut||"99");});
    if(!l.length) return;
    h+='<h2>'+esc(j.n)+'</h2><table>'+l.map(function(c){
      var t=c.titrePub||c.titre, q=c.quiPub||c.qui;
      return '<tr><td class="h">'+esc(hh(c.debut))+(c.fin?' <span>– '+esc(hh(c.fin))+'</span>':"")+'</td><td><div class="t">'+esc(t)+'</div>'+(q?'<div class="q">'+esc(q)+'</div>':"")+'</td></tr>';
    }).join("")+'</table>';
  });
  document.getElementById("feuille").innerHTML=h;
}).catch(function(e){
  if(e&&e.code==="droits"){ location.replace("./"); return; }
  document.getElementById("feuille").innerHTML='<p class="vide">'+esc(e.message||"Erreur")+'</p>';
});
})();
