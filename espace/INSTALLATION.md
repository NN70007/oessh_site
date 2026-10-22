# Espace membres — installation (une seule fois, environ 15 minutes)

L'espace membres se compose de trois pièces :

| Pièce | Où | Contient des données ? |
|---|---|---|
| Les pages (`espace/*.html`) | site oessh.lu (ce dépôt) | **Non** : uniquement l'habillage |
| Le script serveur (`espace/serveur/Code.gs`) | Google Apps Script, compte jb.niedercorn@oessh.lu | **Non** |
| La feuille Google Sheets | Drive de jb.niedercorn@oessh.lu, **partagée avec personne** | **Oui**, uniquement ici |

Personne ne peut lire la feuille directement. Les pages demandent les données au script, qui vérifie l'identité de la personne (connexion Google vérifiée par Google, ou code reçu par e-mail) et ses droits (onglet « Acces ») avant de répondre.

---

## 1. Préparer le compte

1. Ouvrir une session Google avec **jb.niedercorn@oessh.lu**.
2. Vérifier que la **validation en deux étapes** est activée sur ce compte (myaccount.google.com → Sécurité). C'est ce compte qui protège tout le reste.

## 2. Créer la feuille

1. Sur drive.google.com, créer une feuille Google Sheets vide nommée **« OESSH – Espace membres (privé) »**.
2. **Ne la partager avec personne.**

## 3. Installer le script

1. Dans la feuille : menu **Extensions → Apps Script**.
2. Dans l'éditeur qui s'ouvre, effacer le contenu de `Code.gs` et coller tout le contenu de [`espace/serveur/Code.gs`](serveur/Code.gs).
3. En haut du fichier, vérifier `ADMINS_INITIAUX` (l'adresse qui recevra tous les droits au départ).
4. Icône ⚙️ **Paramètres du projet** → fuseau horaire **(GMT+01:00) Europe/Luxembourg**.
5. Cliquer sur 💾 **Enregistrer**.

## 4. Lancer l'installation

1. Dans la liste déroulante des fonctions (en haut), choisir **`installer`**, puis **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations** → choisir jb.niedercorn@oessh.lu.
   Un écran « Google n'a pas validé cette application » peut apparaître : c'est normal pour un script personnel → **Paramètres avancés** → **Accéder à … (non sécurisé)** → **Autoriser**.
   Les autorisations demandées sont : gérer cette feuille, envoyer des e-mails en votre nom (codes de connexion), se connecter à un service externe (vérification des connexions Google).
3. Revenir à la feuille : les onglets `Acces`, `Taches`, `Intervenants`, `Activite`, `Jalons`, `Journal` sont créés.

## 5. Importer les tâches de l'investiture (une seule fois)

Le fichier `Import.gs` est fourni à part (il contient des données : il ne doit **pas** être mis sur GitHub).

1. Dans l'éditeur Apps Script : **+** à côté de « Fichiers » → **Script** → nommer `Import`.
2. Coller le contenu de `Import.gs`, enregistrer.
3. Choisir la fonction **`importerTaches`** → **Exécuter**. Résultat attendu : « 51 tâches importées ».
4. **Supprimer le fichier `Import`** (clic droit → Supprimer).

## 6. Mettre le script en ligne

1. **Déployer → Nouveau déploiement**.
2. ⚙️ Type : **Application Web**.
3. Description : `Espace membres`.
4. Exécuter en tant que : **Moi (jb.niedercorn@oessh.lu)**.
5. Qui a accès : **Tout le monde**.
   (Indispensable pour les personnes sans compte Google. L'adresse est joignable, mais elle ne renvoie **rien** sans session valide.)
6. **Déployer**, puis copier l'**URL de l'application Web** (elle se termine par `/exec`).

## 7. Brancher les pages

Mettre cette URL dans [`espace/config.js`](config.js), ligne `API_URL: ''`, puis publier le site.
(Ou envoyer simplement l'URL à Claude, qui fera la modification.)

## 8. Vérifier la connexion Google

Le bouton « Se connecter avec Google » utilise le même identifiant que l'admin actuel. Si le bouton affiche une erreur d'origine :
console.cloud.google.com → API et services → Identifiants → client `52829295071-…` → **Origines JavaScript autorisées** → vérifier la présence de `https://luxembourg.oessh.lu`.
La connexion par **code e-mail** fonctionne dans tous les cas.

## 9. Premier essai

1. Ouvrir **https://luxembourg.oessh.lu/espace/**.
2. Se connecter (Google ou code).
3. Tuile **Accès** : ajouter les membres du Conseil et leurs droits.

---

## 10. Publication sur le site (admin) sans clé dans le navigateur

L'admin `/espace/admin/` utilise désormais la connexion de l'espace membres. Les clés GitHub et Claude sont rangées **une seule fois dans le script**, jamais dans les navigateurs.

1. **Jeton GitHub** (sur github.com, connecté au compte propriétaire du dépôt) :
   Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Nom : `OESSH espace membres` · Expiration : 1 an (à renouveler)
   - Repository access : **Only select repositories** → `NN70007/oessh_site`
   - Permissions → Repository permissions → **Contents : Read and write** (rien d'autre)
   - Generate, puis copier le jeton (`github_pat_…`).
2. **Clé Claude** : console.anthropic.com → API Keys → Create key (nommée `OESSH espace membres`). Copier la clé (`sk-ant-…`).
3. Dans Apps Script : ⚙️ **Paramètres du projet** → **Propriétés du script** → **Ajouter une propriété du script** :
   - `GITHUB_TOKEN` = le jeton GitHub
   - `CLAUDE_KEY` = la clé Claude
   puis **Enregistrer les propriétés du script**.
4. Déployer une **nouvelle version** (Déployer → Gérer les déploiements → ✏️ → Nouvelle version).
5. Dans la page **Accès**, cocher Actualités / Lectures / Newsletter pour les éditeurs.

Les anciennes clés collées dans les navigateurs peuvent ensuite être révoquées (jeton GitHub de chaque éditeur, clé Claude personnelle).

Ce que vérifie le serveur à chaque publication : la session, le droit de la personne sur la rubrique (actualités, lectures, newsletters), le fichier visé (uniquement ces trois fichiers et des images ou PDF dans `assets/`), et la validité du contenu. Chaque publication est signée du nom de la personne dans l'historique GitHub et inscrite au journal.

## 11. Week-end de retraite (9 et 10 janvier 2027)

La page `espace/retraite.html` fonctionne comme celle de l'investiture (tâches, responsables, intervenants, qui s'en charge), avec en plus une vue **Programme** : les créneaux des deux journées, l'intervenant et l'état de sa confirmation (confirmé, accord de principe, à confirmer, à trouver). Ses données sont dans des onglets séparés : `RetTaches`, `RetIntervenants`, `RetActivite`, `RetJalons`, `RetProgramme`.

1. Coller la nouvelle version de `Code.gs` dans l'éditeur Apps Script, enregistrer.
2. Exécuter **`installer`** : crée les onglets `Ret…` et ajoute une colonne **`Retraite`** à la fin de l'onglet `Acces` (les colonnes existantes ne bougent pas). L'administrateur initial y est inscrit comme organisateur.
3. Importer le programme : fichier `ImportRetraite.gs` fourni à part (il contient des données : **pas sur GitHub**). Dans l'éditeur : **+** → Script → `ImportRetraite`, coller, exécuter **`importerRetraite`** (résultat attendu : « 35 créneaux et 16 tâches importés. Organisation renseignée. »), puis supprimer le fichier. L'onglet `RetOrganisation` (Fonction, Nom) indique qui organise ; il s'affiche sous le titre de la page et se modifie directement dans la feuille.
4. Déployer une **nouvelle version** (Déployer → Gérer les déploiements → ✏️ → Nouvelle version).
5. Page **Accès** : choisir pour chacun un rôle « Week-end de retraite » (organisateur, contributeur, lecture, intervenant). Seuls les organisateurs modifient le programme.

Après le week-end (RGPD) : exécuter `effacerContactsRetraite`.

## Entretien

- **Modifier le script** (nouvelle version de `Code.gs`) : coller le nouveau code, enregistrer, puis **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'URL ne change pas.
- **Déconnecter quelqu'un partout** (appareil perdu, doute) : page Accès → Modifier → « Déconnecter partout ». Ses droits ne changent pas ; il devra simplement se reconnecter.
- **En-têtes de sécurité** : le fichier `espace/.htaccess` limite ce que les pages de l'espace peuvent charger. En cas de problème d'affichage ou de connexion, supprimer ce fichier suffit à revenir à l'état précédent.
- **Nettoyage des sessions** : automatique à chaque connexion ; un déclencheur nocturne reste possible (facultatif) : ⏰ Déclencheurs → Ajouter → fonction `nettoyerSessions`, chaque nuit.
- **Après l'investiture (RGPD)** : exécuter `effacerContactsIntervenants` pour effacer les téléphones et e-mails des intervenants.
- **Retirer un accès** : page Accès (ou décocher « Actif » dans l'onglet `Acces`). Effet immédiat, même pour une personne déjà connectée.
- **Sauvegarde** : la feuille elle-même (Fichier → Télécharger, ou historique des versions de Google Sheets).

## Limites connues

- L'admin de publication (`/espace/admin/`) garde pour l'instant sa propre connexion et le token GitHub de chaque éditeur. Les cases « Actualités / Lectures / Newsletter » de la page Accès servent à afficher la tuile ; elles deviendront contraignantes quand la publication passera par le serveur (phase suivante).
- Envoi d'e-mails : les codes de connexion partent du compte jb.niedercorn@oessh.lu et sont soumis au quota quotidien d'envoi de Google pour ce compte (largement suffisant pour des codes de connexion, pas pour des envois groupés).
- Les modifications des autres apparaissent automatiquement en 30 secondes au plus.

## Pour les développeurs

Tests sans Google (simulateur en mémoire) :

```bash
node espace/dev/test-serveur.js                  # droits, sessions, codes, injections
node espace/dev/serveur-local.js 8787 Import.gs  # site local sur http://localhost:8787/espace/
NODE_PATH=$(npm root -g) node espace/dev/test-pages.js            # tests navigateur (Playwright, données fictives)
```

## 12. Courrier e-mail : suivi des réponses

Chaque courriel envoyé porte deux adresses « Répondre à » : l'adresse de la fonction de l'auteur et une adresse de collecte propre à l'envoi (`reponses+<id>@oessh.lu`). Les copies reçues sont rangées dans le Gmail du compte du script sous l'étiquette **« Réponses courrier »** (hors de la boîte de réception, sauf si la réponse était aussi adressée à une adresse de ce compte), affichées dans « Derniers envois » (nombre de réponses, texte, personnes sans réponse), puis mises à la corbeille après 30 jours.

1. Console d'administration Google : ajouter l'alias **reponses@oessh.lu** au compte jb.niedercorn@oessh.lu (Utilisateurs → jb.niedercorn → Adresses e-mail secondaires). Vérifier qu'un courriel envoyé à `reponses+test@oessh.lu` arrive bien.
2. Apps Script : ⚙️ Paramètres du projet → Propriétés du script → ajouter `REPONSES_ALIAS` = `reponses@oessh.lu`. Tant que cette propriété est vide, rien ne change dans les envois.
3. (Conseillé) ⏰ Déclencheurs → Ajouter → fonction `entretienReponses`, déclencheur temporel, toutes les heures : range les copies et efface celles de plus de 30 jours. Sans déclencheur, cela se fait à l'ouverture de la page Courrier e-mail.

Seuls l'auteur d'un envoi et les gestionnaires en voient les réponses.
