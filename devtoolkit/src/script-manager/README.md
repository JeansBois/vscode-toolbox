# Script Manager

Le Script Manager est un système complet de gestion et d'exécution de scripts Python avec des fonctionnalités avancées de sécurité, de gestion des dépendances et de monitoring des ressources.

## Fonctionnalités Principales

### 1. Gestion des Scripts
- Enregistrement et organisation des scripts
- Catégorisation et étiquetage
- Système de templates
- Versionnement des scripts
- Import/export de scripts

### 2. Sécurité
- Validation des scripts
- Exécution en sandbox
- Gestion des permissions
- Limites de ressources
- Validation des signatures

### 3. Gestion des Dépendances
- Installation automatique
- Résolution des conflits
- Gestion des versions
- Dépendances isolées par script

### 4. Monitoring et Exécution
- Suivi en temps réel
- Monitoring des ressources
- Historique d'exécution
- Gestion des erreurs
- Formatage des sorties

## Installation

```bash
npm install @devtoolkit/script-manager
```

## Utilisation

### Configuration de Base

```typescript
import { ScriptManager } from '@devtoolkit/script-manager';

const manager = new ScriptManager(context);
```

### Enregistrement d'un Script

```typescript
const scriptInfo = {
    id: 'mon-script',
    name: 'Mon Script',
    version: '1.0.0',
    description: 'Description du script',
    author: 'Auteur',
    category: 'utils',
    tags: ['util', 'data']
};

await manager.registerScript('chemin/vers/script.py', scriptInfo);
```

### Exécution d'un Script

```typescript
const result = await manager.executeScript('mon-script', {
    param1: 'valeur1',
    param2: 'valeur2'
});

console.log(result.output);
```

### Gestion des Templates

```typescript
const templateInfo = {
    name: 'data-processor',
    description: 'Template pour le traitement de données',
    variables: [
        {
            name: 'input_format',
            type: 'string',
            description: 'Format des données d\'entrée',
            required: true
        }
    ]
};

await manager.createTemplate('mon-template', templateInfo);

// Création d'un script à partir du template
await manager.instantiateTemplate('data-processor', {
    input_format: 'csv'
}, 'nouveau-script');
```

### Monitoring des Ressources

```typescript
manager.onExecutionProgress((progress) => {
    console.log(`Progression: ${progress.progress}%`);
    console.log(`Mémoire utilisée: ${progress.resourceUsage.currentMemory} MB`);
    console.log(`CPU utilisé: ${progress.resourceUsage.currentCpu}%`);
});
```

### Gestion des Permissions

```typescript
const permissions = {
    allowedImports: ['pandas', 'numpy'],
    allowedPaths: ['/data'],
    allowNetworking: false,
    allowFileSystem: true
};

await manager.setScriptPermissions('mon-script', permissions);
```

## Architecture

Le Script Manager est composé de plusieurs modules spécialisés :

- **Core**: Gestion centrale des scripts et événements
- **Manifest**: Validation et gestion des manifestes
- **Security**: Sécurité et permissions
- **Dependency**: Gestion des dépendances
- **Execution**: Exécution et monitoring
- **Template**: Gestion des templates

## Sécurité

Le système implémente plusieurs niveaux de sécurité :

1. **Validation des Scripts**
   - Analyse statique du code
   - Vérification des imports
   - Validation des chemins d'accès

2. **Contrôle d'Exécution**
   - Limites de ressources
   - Isolation des dépendances
   - Monitoring en temps réel

3. **Permissions**
   - Contrôle des imports
   - Accès fichiers restreint
   - Restrictions réseau

## Monitoring

Le système fournit des métriques détaillées :

- Utilisation CPU
- Consommation mémoire
- Durée d'exécution
- Statistiques d'utilisation
- Historique des exécutions

## Contribution

Les contributions sont les bienvenues ! Consultez notre guide de contribution pour plus de détails.

## Licence

MIT
