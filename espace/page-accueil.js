/* Script de la page index.html (externe pour la politique de sécurité du contenu). */
(function(){
  "use strict";
  var E=window.Espace, $=function(s){return document.querySelector(s);};
  var emailEnCours="";

  function msg(id,text){ ["#login-err","#login-info"].forEach(function(k){ $(k).hidden=true; }); if(text){ $(id).textContent=text; $(id).hidden=false; } }

  function showLogin(){
    E.renderTop(); E.renderFoot();
    $("#login").hidden=false; $("#home").hidden=true;
    if(/expire=1/.test(location.search)) msg("#login-err","Votre session a expiré. Merci de vous reconnecter.");
    if(!E.CFG.API_URL) msg("#login-err","Le serveur n'est pas encore configuré : l'adresse du script Google manque dans espace/config.js.");
    initGoogle();
  }

  function initGoogle(){
    if(window.google&&google.accounts&&google.accounts.id){
      google.accounts.id.initialize({client_id:E.CFG.GOOGLE_CLIENT_ID,callback:onGoogle,auto_select:false,ux_mode:"popup"});
      google.accounts.id.renderButton($("#g-btn"),{type:"standard",theme:"outline",size:"large",text:"signin_with",shape:"rectangular",logo_alignment:"left",locale:"fr",width:300});
    } else { setTimeout(initGoogle,300); }
  }

  async function onGoogle(r){
    msg();
    try{ var out=await E.api("auth.google",{idToken:r.credential}); done(out); }
    catch(e){ msg("#login-err",e.message); }
  }
  function done(out){ E.setSession({token:out.token,expire:out.expire,user:out.user}); history.replaceState(null,"","./"); showHome(); }

  $("#f-email").addEventListener("submit",async function(ev){
    ev.preventDefault(); msg();
    var email=$("#in-email").value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg("#login-err","Saisissez une adresse e-mail valide."); return; }
    var b=$("#btn-code"); b.disabled=true; b.textContent="Envoi…";
    try{ var out=await E.api("auth.demanderCode",{email:email}); emailEnCours=email; $("#f-email").hidden=true; $("#f-code").hidden=false; msg("#login-info",out.message); $("#in-code").focus(); }
    catch(e){ msg("#login-err",e.message); }
    finally{ b.disabled=false; b.textContent="Recevoir un code"; }
  });
  $("#f-code").addEventListener("submit",async function(ev){
    ev.preventDefault(); msg();
    var code=$("#in-code").value.replace(/\D/g,"");
    if(code.length!==6){ msg("#login-err","Le code comporte 6 chiffres."); return; }
    var b=$("#btn-verif"); b.disabled=true;
    try{ done(await E.api("auth.verifierCode",{email:emailEnCours,code:code})); }
    catch(e){ msg("#login-err",e.message); }
    finally{ b.disabled=false; }
  });
  $("#btn-retour").addEventListener("click",function(){ $("#f-code").hidden=true; $("#f-email").hidden=false; $("#in-code").value=""; msg(); });

  var ROLE_TXT={organisateur:"Organisateur",contributeur:"Contributeur",lecture:"Lecture",intervenant:"Intervenant"};
  function showHome(){
    var s=E.getSession(); var u=s.user;
    E.renderTop({active:"accueil"}); E.renderFoot();
    $("#login").hidden=true; $("#home").hidden=false;
    $("#home-title").textContent="Bonjour, "+u.nom.split(" ")[0]+".";
    var T=[];
    if(u.inv) T.push({h:"investiture.html",n:"— 9 & 10 juillet 2027",t:"Investiture 2027",p:"Tâches, responsables, équipes et calendrier des cérémonies d'investiture.",r:ROLE_TXT[u.inv]});
    if(u.site&&(u.site.actualites||u.site.lectures||u.site.newsletter)) T.push({h:"../admin/",n:"— Publication",t:"Administration du site",p:"Rédiger et publier les actualités, lectures et newsletters du site oessh.lu.",r:[u.site.actualites?"Actualités":"",u.site.lectures?"Lectures":"",u.site.newsletter?"Newsletter":""].filter(Boolean).join(" · ")});
    if(u.gestion) T.push({h:"acces.html",n:"— Gestion",t:"Accès",p:"Inscrire une personne et choisir ce qu'elle peut voir ou modifier.",r:"Gestionnaire"});
    $("#tiles").innerHTML=T.length?T.map(function(x){return '<a class="tile" href="'+x.h+'"><span class="pn">'+E.esc(x.n)+'</span><h3>'+E.esc(x.t)+'</h3><p>'+E.esc(x.p)+'</p>'+(x.r?'<span class="role-pill">'+E.esc(x.r)+'</span>':"")+'<span class="go">Ouvrir →</span></a>';}).join(""):'<div class="notice" style="grid-column:1/-1"><h4>Aucun espace ne vous est encore ouvert.</h4><p>Le secrétariat de la Lieutenance peut vous donner les accès nécessaires.</p></div>';
    // Rafraîchit les droits en arrière-plan.
    E.api("moi").then(function(out){ var s2=E.getSession(); if(s2&&JSON.stringify(s2.user)!==JSON.stringify(out.user)){ s2.user=out.user; E.setSession(s2); showHome(); } }).catch(function(e){ if(e&&e.code==="session"){ location.replace("./?expire=1"); } });
  }

  if(E.getSession()) showHome(); else showLogin();
})();
