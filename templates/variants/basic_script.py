#!/usr/bin/env python3
"""
Basic Script Template
-------------------
Template minimal pour les scripts simples avec:
- Configuration de base
- Validation d'entrée simple
- Gestion d'erreurs basique
- Sortie formatée
"""

from pathlib import Path
from typing import Dict, Any
import sys

from ..script_template import ScriptBase, ScriptError, ScriptErrorLevel

class BasicScript(ScriptBase[Dict[str, Any], Dict[str, Any]]):
    """Implémentation minimale d'un script DevToolBox"""
    
    def execute(self) -> bool:
        """
        Exécute la logique principale du script.
        
        Returns:
            bool: True si succès, False sinon
        """
        try:
            self.logger.info("Démarrage de l'exécution")
            
            # Création d'une étape de progression
            step = self.progress.add_step(1, "Traitement")
            
            # Logique principale ici
            # ...
            
            # Mise à jour progression
            self.progress.update(step)
            
            # Exemple de résultat
            result = {
                "status": "success",
                "data": {
                    "message": "Opération terminée"
                }
            }
            
            # Génération sortie
            self.generate_output(result)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur d'exécution: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    script = BasicScript()
    sys.exit(script.run())

if __name__ == "__main__":
    main()
