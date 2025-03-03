# DevToolBox Script Templates

Ce répertoire contient les templates standardisés pour créer de nouveaux scripts DevToolBox.

## Structure

```
templates/
├── script_manifest.json    # Template de manifeste
├── script_template.py      # Template de script Python
└── example/               # Exemple d'implémentation
    ├── text_analyzer.py
    └── text_analyzer_manifest.json
```

## Création d'un Nouveau Script

1. Créez un nouveau dossier pour votre script
2. Copiez `script_manifest.json` et personnalisez-le avec les informations de votre script
3. Créez votre script Python en utilisant `script_template.py` comme base

### Format du Manifeste

Le manifeste (`script_manifest.json`) définit les métadonnées et l'interface du script :

```json
{
    "script_info": {
        "id": "unique-id",              // Identifiant unique
        "name": "Script Name",          // Nom d'affichage
        "version": "1.0.0",            // Version sémantique
        "description": "Description",   // Description du script
        "author": "Author Name",       // Auteur
        "category": "category",        // Catégorie
        "tags": ["tag1", "tag2"]       // Tags pour la recherche
    },
    "execution": {
        "python_version": ">=3.8",     // Version Python requise
        "dependencies": [],            // Dépendances pip
        "entry_point": "script.py",    // Point d'entrée
        "environment_vars": []         // Variables d'environnement
    },
    "interface": {
        "inputs": [                    // Paramètres d'entrée
            {
                "name": "param_name",
                "type": "file|directory|string|number|boolean",
                "description": "Parameter description",
                "required": true|false,
                "default": null
            }
        ],
        "outputs": [                   // Spécifications de sortie
            {
                "name": "output_name",
                "type": "file|directory|console",
                "description": "Output description"
            }
        ],
        "file_list": {                // Configuration de la liste de fichiers
            "required": true|false,
            "filter": [".ext1", ".ext2"],
            "description": "Files description"
        }
    }
}
```

### Structure du Script Python

Le template Python (`script_template.py`) fournit une structure de base avec :

- Gestion des arguments basée sur le manifeste
- Configuration du logging
- Validation des entrées
- Gestion des erreurs
- Reporting de progression
- Génération des sorties

Pour implémenter un nouveau script :

1. Héritez de la classe `ScriptBase`
2. Implémentez la méthode `execute()`
3. Utilisez les méthodes utilitaires fournies :
   - `self.logger` pour le logging
   - `self.args` pour accéder aux arguments
   - `report_progress()` pour le reporting
   - `generate_output()` pour les sorties

Exemple :

```python
from script_template import ScriptBase

class MyScript(ScriptBase):
    def execute(self) -> bool:
        try:
            # Accès aux arguments validés
            input_path = self.args.input_path
            verbose = getattr(self.args, 'verbose', False)
            
            if verbose:
                self.logger.info(f"Processing: {input_path}")
            
            # Votre logique ici
            result = {"status": "success"}
            
            # Générer la sortie
            self.generate_output(result)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Execution failed: {str(e)}")
            return False

def main():
    script = MyScript()
    sys.exit(script.run())

if __name__ == "__main__":
    main()
```

## Exemple Complet

Voir le dossier `example/` pour une implémentation complète d'un analyseur de fichiers texte qui démontre :

- Structure du manifeste
- Implémentation du script
- Gestion des arguments
- Formatage des sorties
- Gestion des erreurs

Pour exécuter l'exemple :

```bash
python text_analyzer.py --input_file path/to/file.txt --output_format text --verbose
```

## Bonnes Pratiques

1. **Documentation**
   - Documentez votre script avec des docstrings
   - Incluez des exemples d'utilisation
   - Décrivez clairement les entrées/sorties

2. **Gestion des Erreurs**
   - Utilisez try/except pour gérer les erreurs
   - Loggez les erreurs avec des messages clairs
   - Retournez False de execute() en cas d'erreur

3. **Validation des Entrées**
   - Validez tous les paramètres d'entrée
   - Vérifiez l'existence des fichiers/dossiers
   - Validez les formats et les valeurs

4. **Progression et Feedback**
   - Utilisez report_progress() pour les longues opérations
   - Loggez les étapes importantes
   - Activez le mode verbose pour le débogage

5. **Sorties**
   - Utilisez generate_output() pour les sorties
   - Supportez plusieurs formats si pertinent
   - Structurez les sorties de manière cohérente
