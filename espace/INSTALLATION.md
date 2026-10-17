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

## Entretien

- **Modifier le script** (nouvelle version de `Code.gs`) : coller le nouveau code, enregistrer, puis **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'URL ne change pas.
- **Déconnecter quelqu'un partout** (appareil perdu, doute) : page Accès → Modifier → « Déconnecter partout ». Ses droits ne changent pas ; il devra simplement se reconnecter.
- **En-têtes de sécurité** : le fichier `espace/.htaccess` limite ce que les pages de l'espace peuvent charger. En cas de problème d'affichage ou de connexion, supprimer ce fichier suffit à revenir à l'état précédent.
- **Nettoyage des sessions** : automatique à chaque connexion ; un déclencheur nocturne reste possible (facultatif) : ⏰ Déclencheurs → Ajouter → fonction `nettoyerSessions`, chaque nuit.
- **Après l'investiture (RGPD)** : exécuter `effacerContactsIntervenants` pour effacer les téléphones et e-mails des intervenants.
- **Retirer un accès** : page Accès (ou décocher « Actif » dans l'onglet `Acces`). Effet immédiat, même pour une personne déjà connectée.
- **Sauvegarde** : la feuille elle-même (Fichier → Télécharger, ou historique des versions de Google Sheets).

## Limites connues

- L'admin de publication (`/admin/`) garde pour l'instant sa propre connexion et le token GitHub de chaque éditeur. Les cases « Actualités / Lectures / Newsletter » de la page Accès servent à afficher la tuile ; elles deviendront contraignantes quand la publication passera par le serveur (phase suivante).
- Envoi d'e-mails : les codes de connexion partent du compte jb.niedercorn@oessh.lu et sont soumis au quota quotidien d'envoi de Google pour ce compte (largement suffisant pour des codes de connexion, pas pour des envois groupés).
- Les modifications des autres apparaissent automatiquement en 30 secondes au plus.

## Pour les développeurs

Tests sans Google (simulateur en mémoire) :

```bash
node espace/dev/test-serveur.js                  # droits, sessions, codes, injections
node espace/dev/serveur-local.js 8787 Import.gs  # site local sur http://localhost:8787/espace/
NODE_PATH=$(npm root -g) node espace/dev/test-pages.js            # tests navigateur (Playwright, données fictives)
```
