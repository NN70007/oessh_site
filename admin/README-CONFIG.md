# Configuration de l'interface Admin OESSH

## Vue d'ensemble

Le fichier `admin-config.json` centralise tous les paramètres rédactionnels de l'interface d'administration. Il permet de configurer facilement les champs, validations, messages et comportements sans modifier le code HTML/JavaScript.

## Fichier de configuration

**Emplacement:** `/admin/admin-config.json`

## Structure de la configuration

### 1. Informations générales

```json
{
  "version": "1.0.0",
  "description": "Configuration rédactionnelle pour l'interface admin OESSH"
}
```

### 2. Configuration des langues

```json
{
  "langues": {
    "disponibles": ["fr", "de", "en"],
    "principale": "fr",
    "labels": {
      "fr": "Français",
      "de": "Deutsch",
      "en": "English"
    }
  }
}
```

**Paramètres modifiables:**
- `disponibles`: Liste des codes de langues supportées
- `principale`: Langue par défaut pour la rédaction
- `labels`: Libellés affichés pour chaque langue

### 3. Configuration des articles

#### Champs d'article

Chaque champ a la structure suivante:

```json
{
  "nom_du_champ": {
    "type": "text|textarea|date|file|url|array",
    "label": "Libellé affiché",
    "placeholder": "Texte d'exemple",
    "rows": 3,                    // Pour les textareas
    "obligatoire": true|false,
    "multilingue": true|false,
    "validation": {
      "minLength": 3,
      "maxLength": 200,
      "maxSize": 5242880,         // Pour les fichiers (en octets)
      "formats": ["jpg", "png"]   // Pour les fichiers
    },
    "hint": "Texte d'aide optionnel"
  }
}
```

#### Messages personnalisables

```json
{
  "messages": {
    "validation": {
      "titre_manquant": "Le titre est obligatoire",
      "titre_trop_court": "Le titre doit faire au moins 3 caractères",
      ...
    },
    "succes": {
      "article_cree": "Article créé avec succès",
      ...
    },
    "erreur": {
      "creation_echouee": "Erreur lors de la création de l'article",
      ...
    }
  }
}
```

#### Workflow (étapes de création)

```json
{
  "workflow": {
    "etapes": [
      {
        "id": "step1",
        "numero": 1,
        "titre": "Infos & Médias",
        "description": "Date, lieu, image, catégories"
      },
      ...
    ]
  }
}
```

### 4. Configuration des livres

Structure identique aux articles, avec des champs spécifiques:
- `categorie`
- `auteur`
- `titre`
- `resume`
- `citation`
- `citation_source`
- `couverture`

### 5. Configuration de la traduction

```json
{
  "traduction": {
    "service": "claude",
    "modele": "claude-sonnet-4-5-20250929",
    "instructions": {
      "de": "Traduisez en allemand de manière formelle...",
      "en": "Traduisez en anglais de manière formelle..."
    },
    "temperature": 0.3
  }
}
```

**Paramètres modifiables:**
- `modele`: Version du modèle Claude à utiliser
- `instructions`: Instructions de traduction par langue
- `temperature`: Créativité de la traduction (0.0 = précis, 1.0 = créatif)

### 6. Configuration de l'interface

```json
{
  "interface": {
    "tableaux": {
      "articlesParPage": 50,
      "livresParPage": 50,
      "afficherMiniatures": true,
      "afficherBadges": true
    },
    "boutons": {
      "labels": {
        "nouveau": "Nouvel article",
        "editer": "✏",
        "supprimer": "🗑",
        ...
      }
    },
    "textes": {
      "chargement": "Chargement...",
      "aucunArticle": "Aucun article pour le moment",
      ...
    }
  }
}
```

### 7. Configuration API et chemins

```json
{
  "api": {
    "endpoints": {
      "articles": "../actualites.json",
      "lectures": "../lectures.json"
    },
    "images": {
      "cheminBase": "../assets/",
      "cheminArticles": "../assets/",
      "cheminLivres": "../assets/"
    }
  }
}
```

## Utilisation dans le code

La configuration est chargée automatiquement au démarrage de la page et stockée dans la variable globale `CONFIG`.

### Accéder à un paramètre

```javascript
// Méthode 1: Accès direct
var langues = CONFIG.langues.disponibles;

// Méthode 2: Fonction helper
var langues = getConfig('langues.disponibles');
```

### Récupérer un message

```javascript
// Récupérer un message de validation
var message = getMessage('articles.validation', 'titre_manquant');
// Retourne: "Le titre est obligatoire"

// Récupérer un message de succès
var message = getMessage('articles.succes', 'article_cree');
// Retourne: "Article créé avec succès"
```

### Exemples d'utilisation

```javascript
// Validation d'un champ
function validateTitre(titre) {
  var config = getConfig('articles.champs.titre');

  if (config.obligatoire && !titre.trim()) {
    alert(getMessage('articles.validation', 'titre_manquant'));
    return false;
  }

  if (titre.length < config.validation.minLength) {
    alert(getMessage('articles.validation', 'titre_trop_court'));
    return false;
  }

  return true;
}

// Afficher les langues disponibles
function renderLangueTabs() {
  var langues = getConfig('langues.disponibles');
  var labels = getConfig('langues.labels');

  langues.forEach(function(lang) {
    console.log(lang + ': ' + labels[lang]);
    // fr: Français
    // de: Deutsch
    // en: English
  });
}

// Construire un placeholder dynamique
function setPlaceholder(fieldName) {
  var config = getConfig('articles.champs.' + fieldName);
  var input = document.getElementById(fieldName);

  if (config && config.placeholder) {
    input.placeholder = config.placeholder;
  }
}
```

## Modifications courantes

### Changer les libellés des boutons

Modifiez `interface.boutons.labels`:

```json
{
  "labels": {
    "nouveau": "Créer un nouvel article",
    "editer": "Modifier",
    "supprimer": "Effacer"
  }
}
```

### Ajouter une nouvelle langue

1. Ajoutez le code dans `langues.disponibles`:
```json
"disponibles": ["fr", "de", "en", "it"]
```

2. Ajoutez le label:
```json
"labels": {
  ...
  "it": "Italiano"
}
```

3. Ajoutez les instructions de traduction:
```json
"traduction": {
  "instructions": {
    ...
    "it": "Traduisez en italien..."
  }
}
```

### Modifier les règles de validation

Exemple pour le titre d'article:

```json
{
  "titre": {
    ...
    "validation": {
      "minLength": 5,      // Au lieu de 3
      "maxLength": 250     // Au lieu de 200
    }
  }
}
```

### Changer les messages d'erreur

```json
{
  "messages": {
    "validation": {
      "titre_manquant": "⚠️ Veuillez saisir un titre",
      "titre_trop_court": "⚠️ Le titre doit contenir au moins 3 caractères"
    }
  }
}
```

### Modifier le modèle de traduction

```json
{
  "traduction": {
    "modele": "claude-opus-4-5-20251101",  // Version plus puissante
    "temperature": 0.5                      // Plus créatif
  }
}
```

## Backup et versioning

### Avant de modifier

1. **Sauvegardez le fichier original:**
   ```bash
   cp admin-config.json admin-config.json.backup
   ```

2. **Testez vos modifications** sur une copie locale avant de publier

3. **Utilisez Git** pour tracker les changements:
   ```bash
   git add admin/admin-config.json
   git commit -m "Config: modification des validations"
   ```

### Restaurer une version précédente

```bash
# Restaurer depuis le backup
cp admin-config.json.backup admin-config.json

# Ou avec git
git checkout HEAD~1 admin/admin-config.json
```

## Validation du fichier JSON

Avant de déployer, vérifiez que le JSON est valide:

1. **En ligne:** https://jsonlint.com/
2. **En ligne de commande:**
   ```bash
   python3 -m json.tool admin-config.json
   ```

## Dépannage

### La configuration ne se charge pas

1. Vérifiez la console du navigateur (F12)
2. Cherchez les erreurs JavaScript
3. Vérifiez que le fichier `admin-config.json` est accessible à l'URL `./admin-config.json`

### Les modifications ne sont pas prises en compte

1. **Videz le cache du navigateur** (Ctrl+Shift+R)
2. Vérifiez la syntaxe JSON (virgules, guillemets)
3. Relancez la page en mode navigation privée

### Message "Impossible de charger admin-config.json"

Le système utilisera la configuration par défaut intégrée au code. Vérifiez:
- Le fichier existe bien dans `/admin/admin-config.json`
- Les permissions de lecture sont correctes
- Le serveur web sert les fichiers `.json`

## Support

Pour toute question ou problème:
- Vérifiez la console développeur (F12)
- Consultez les logs dans la console JavaScript
- La version de la config chargée s'affiche au démarrage

---

**Dernière mise à jour:** Juin 2026
**Version de la config:** 1.0.0
