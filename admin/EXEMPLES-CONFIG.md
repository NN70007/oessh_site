# Exemples d'utilisation de la configuration

## Exemples pratiques d'utilisation de `admin-config.json`

Ce document présente des exemples concrets de modification et d'utilisation du fichier de configuration.

---

## 1. Personnaliser les messages d'interface

### Avant (code en dur)
```javascript
alert('Article créé avec succès');
```

### Après (avec la config)
```javascript
alert(getMessage('articles.succes', 'article_cree'));
```

**Dans admin-config.json:**
```json
{
  "articles": {
    "messages": {
      "succes": {
        "article_cree": "✓ Votre article a été créé avec succès !"
      }
    }
  }
}
```

---

## 2. Modifier les validations

### Exemple: Augmenter la longueur minimale du titre

**Dans admin-config.json:**
```json
{
  "articles": {
    "champs": {
      "titre": {
        "validation": {
          "minLength": 10,    // Au lieu de 3
          "maxLength": 300    // Au lieu de 200
        }
      }
    }
  }
}
```

**Code JavaScript pour utiliser ces validations:**
```javascript
function validateTitre(titre) {
  var config = getConfig('articles.champs.titre.validation');

  if (titre.length < config.minLength) {
    alert('Le titre doit faire au moins ' + config.minLength + ' caractères');
    return false;
  }

  if (titre.length > config.maxLength) {
    alert('Le titre ne peut pas dépasser ' + config.maxLength + ' caractères');
    return false;
  }

  return true;
}
```

---

## 3. Changer les placeholders

### Configuration des placeholders

**Dans admin-config.json:**
```json
{
  "articles": {
    "champs": {
      "titre": {
        "placeholder": "Ex: Célébration de la Pentecôte à Luxembourg"
      },
      "lieu": {
        "placeholder": "Luxembourg-Ville, Cathédrale Notre-Dame"
      }
    }
  }
}
```

**Code JavaScript pour appliquer automatiquement:**
```javascript
function applyPlaceholders() {
  var fields = ['titre', 'lieu', 'teaser', 'texte'];

  fields.forEach(function(fieldName) {
    var config = getConfig('articles.champs.' + fieldName);
    var input = document.getElementById('fr-' + fieldName);

    if (config && config.placeholder && input) {
      input.placeholder = config.placeholder;
    }
  });
}

// Appeler au chargement de la page
applyPlaceholders();
```

---

## 4. Configurer les textures de textarea

### Modifier le nombre de lignes

**Dans admin-config.json:**
```json
{
  "articles": {
    "champs": {
      "teaser": {
        "type": "textarea",
        "rows": 5    // Au lieu de 3
      },
      "texte": {
        "type": "textarea",
        "rows": 10   // Au lieu de 6
      }
    }
  }
}
```

**Code JavaScript pour appliquer:**
```javascript
function applyTextareaRows() {
  ['teaser', 'texte'].forEach(function(fieldName) {
    var config = getConfig('articles.champs.' + fieldName);
    var textarea = document.getElementById('fr-' + fieldName);

    if (config && config.rows && textarea) {
      textarea.rows = config.rows;
    }
  });
}
```

---

## 5. Personnaliser les boutons

### Changer les labels des boutons

**Dans admin-config.json:**
```json
{
  "interface": {
    "boutons": {
      "labels": {
        "nouveau": "➕ Créer",
        "editer": "✏️ Modifier",
        "supprimer": "🗑️ Effacer",
        "publier": "✓ Publier en ligne",
        "traduire": "🌍 Auto-traduire"
      }
    }
  }
}
```

**Code JavaScript pour utiliser:**
```javascript
function createButton(action) {
  var labels = getConfig('interface.boutons.labels');
  var button = document.createElement('button');
  button.textContent = labels[action] || action;
  return button;
}

// Exemple d'utilisation
var btnNouveau = createButton('nouveau');   // "➕ Créer"
var btnEditer = createButton('editer');     // "✏️ Modifier"
```

---

## 6. Ajouter une langue italienne

### Étape 1: Ajouter dans la config

**Dans admin-config.json:**
```json
{
  "langues": {
    "disponibles": ["fr", "de", "en", "it"],
    "labels": {
      "fr": "Français",
      "de": "Deutsch",
      "en": "English",
      "it": "Italiano"
    }
  },
  "traduction": {
    "instructions": {
      "de": "...",
      "en": "...",
      "it": "Traduisez en italien de manière formelle et respectueuse, adaptée au contexte religieux catholique"
    }
  }
}
```

### Étape 2: Code pour générer les onglets automatiquement

```javascript
function renderLangueTabs() {
  var langues = getConfig('langues.disponibles');
  var labels = getConfig('langues.labels');
  var container = document.getElementById('lang-tabs');

  container.innerHTML = '';

  langues.forEach(function(lang) {
    var tab = document.createElement('button');
    tab.className = 'lang-tab';
    tab.textContent = labels[lang];
    tab.dataset.lang = lang;

    tab.onclick = function() {
      showLangPanel(lang);
    };

    container.appendChild(tab);
  });
}
```

---

## 7. Configurer les instructions de traduction

### Personnaliser les instructions par langue

**Dans admin-config.json:**
```json
{
  "traduction": {
    "service": "claude",
    "modele": "claude-sonnet-4-5-20250929",
    "instructions": {
      "de": "Traduisez en allemand formel. Utilisez 'Sie' (vouvoiement). Respectez la terminologie catholique traditionnelle. Adaptez les références culturelles.",
      "en": "Translate to formal English. Respect Catholic terminology. Adapt cultural references for an international audience."
    },
    "temperature": 0.2
  }
}
```

**Code JavaScript pour utiliser:**
```javascript
async function traduireArticle(texteFR, langCible) {
  var config = getConfig('traduction');
  var instruction = config.instructions[langCible];

  var prompt = instruction + '\n\nTexte à traduire:\n' + texteFR;

  // Appel API Claude avec les paramètres de la config
  var response = await callClaude(prompt, {
    model: config.modele,
    temperature: config.temperature
  });

  return response;
}
```

---

## 8. Personnaliser les messages de validation

### Messages multilingues

**Dans admin-config.json:**
```json
{
  "articles": {
    "messages": {
      "validation": {
        "titre_manquant": "⚠️ Le titre est obligatoire",
        "titre_trop_court": "⚠️ Le titre doit faire au moins {min} caractères",
        "image_manquante": "📷 Veuillez ajouter une image",
        "date_manquante": "📅 La date est obligatoire"
      }
    }
  }
}
```

**Code JavaScript avec remplacement de variables:**
```javascript
function getValidationMessage(key, params) {
  var message = getMessage('articles.validation', key);

  // Remplacer les variables {min}, {max}, etc.
  if (params) {
    Object.keys(params).forEach(function(param) {
      message = message.replace('{' + param + '}', params[param]);
    });
  }

  return message;
}

// Utilisation
var config = getConfig('articles.champs.titre.validation');
if (titre.length < config.minLength) {
  alert(getValidationMessage('titre_trop_court', { min: config.minLength }));
}
```

---

## 9. Configuration des workflows

### Personnaliser les étapes de création

**Dans admin-config.json:**
```json
{
  "articles": {
    "workflow": {
      "etapes": [
        {
          "id": "step1",
          "numero": 1,
          "titre": "📋 Métadonnées",
          "description": "Date, lieu, catégories et image"
        },
        {
          "id": "step2",
          "numero": 2,
          "titre": "✍️ Rédaction",
          "description": "Titre, résumé et texte intégral en français"
        },
        {
          "id": "step3",
          "numero": 3,
          "titre": "🌍 Traduction",
          "description": "Versions allemande et anglaise"
        },
        {
          "id": "step4",
          "numero": 4,
          "titre": "✓ Publication",
          "description": "Prévisualisation et mise en ligne"
        }
      ]
    }
  }
}
```

**Code JavaScript pour générer les étapes:**
```javascript
function renderWorkflowSteps() {
  var etapes = getConfig('articles.workflow.etapes');
  var container = document.getElementById('workflow-container');

  container.innerHTML = '';

  etapes.forEach(function(etape) {
    var div = document.createElement('div');
    div.className = 'wstep';
    div.id = etape.id;

    div.innerHTML = `
      <div class="wstep-head">
        <div class="wstep-num">${etape.numero}</div>
        <div class="wstep-title">${etape.titre}</div>
      </div>
      <div class="wstep-body">
        <p class="wstep-hint">${etape.description}</p>
        <!-- Contenu de l'étape -->
      </div>
    `;

    container.appendChild(div);
  });
}
```

---

## 10. Configuration des exports

**Dans admin-config.json:**
```json
{
  "export": {
    "formats": ["json", "csv", "zip"],
    "nomFichier": {
      "json": "export-articles-{date}.json",
      "csv": "export-articles-{date}.csv",
      "zip": "export-complet-{date}.zip"
    }
  }
}
```

**Code JavaScript:**
```javascript
function getExportFileName(format) {
  var template = getConfig('export.nomFichier.' + format);
  var date = new Date().toISOString().split('T')[0];
  return template.replace('{date}', date);
}

// Utilisation
var filename = getExportFileName('json');
// Résultat: "export-articles-2026-06-21.json"
```

---

## Astuces

### 1. Validation complète avec la config

```javascript
function validateArticle(article) {
  var errors = [];

  // Vérifier chaque champ défini comme obligatoire
  var champs = getConfig('articles.champs');

  Object.keys(champs).forEach(function(fieldName) {
    var config = champs[fieldName];

    if (config.obligatoire && !article[fieldName]) {
      var message = getMessage('articles.validation', fieldName + '_manquant');
      errors.push(message);
    }

    // Validation de longueur
    if (config.validation) {
      var val = article[fieldName];
      var vConfig = config.validation;

      if (vConfig.minLength && val.length < vConfig.minLength) {
        errors.push(fieldName + ' trop court');
      }

      if (vConfig.maxLength && val.length > vConfig.maxLength) {
        errors.push(fieldName + ' trop long');
      }
    }
  });

  return errors;
}
```

### 2. Génération automatique de formulaire

```javascript
function generateForm(type) {
  var champs = getConfig(type + '.champs');
  var form = document.createElement('form');

  Object.keys(champs).forEach(function(fieldName) {
    var config = champs[fieldName];

    var label = document.createElement('label');
    label.textContent = config.label;

    var input;
    if (config.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = config.rows || 3;
    } else {
      input = document.createElement('input');
      input.type = config.type;
    }

    input.id = fieldName;
    input.placeholder = config.placeholder || '';
    input.required = config.obligatoire || false;

    label.appendChild(input);
    form.appendChild(label);
  });

  return form;
}
```

---

**Ces exemples montrent comment utiliser `admin-config.json` pour rendre l'interface admin complètement configurable sans toucher au code !**
