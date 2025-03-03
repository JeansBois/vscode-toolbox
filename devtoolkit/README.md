# DevToolkit Extension VSCode

Extension VSCode pour la gestion d'outils de développement avec support Python intégré.

## Fonctionnalités

- Interface WebView pour la gestion des scripts
- Système de checklist pour les fichiers
- Gestion des scripts Python
- Environnement d'exécution Python intégré

## Structure du Projet

```
/devtoolkit
  /src
    /webview              # Composants UI
    /script-manager       # Gestion des scripts
    /file-manager        # Système de checklist
    /python-runtime      # Environnement Python
  /templates             # Templates de scripts
  /scripts               # Scripts intégrés
  /media                 # Ressources
```

## Prérequis

- Node.js (v16 ou supérieur)
- Python (v3.6 ou supérieur)
- Visual Studio Code (v1.85.0 ou supérieur)

## Installation pour le Développement

1. Cloner le dépôt :
```bash
git clone [url-du-repo]
cd devtoolkit
```

2. Installer les dépendances :
```bash
npm install
```

3. Compiler l'extension :
```bash
npm run compile
```

4. Lancer l'extension en mode développement :
   - Ouvrir le projet dans VSCode
   - Appuyer sur F5 pour lancer une nouvelle fenêtre avec l'extension

## Utilisation

1. Ouvrir la palette de commandes (Ctrl+Shift+P / Cmd+Shift+P)
2. Rechercher "DevToolkit: Open Panel"
3. L'interface principale s'ouvrira dans un nouvel onglet

## Développement

### Scripts disponibles

- `npm run compile` : Compile le projet
- `npm run watch` : Compile en mode watch
- `npm run lint` : Vérifie le code avec ESLint
- `npm test` : Lance les tests

### Déboggage

1. Mettre des points d'arrêt dans le code TypeScript
2. Lancer l'extension en mode débogage (F5)
3. Les points d'arrêt seront actifs dans la fenêtre de développement

## Licence

[MIT](LICENSE)
