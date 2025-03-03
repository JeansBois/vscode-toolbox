#!/usr/bin/env python3
"""
Script d'exemple utilisant le template de base DevToolkit.
Ce script démontre l'utilisation du template avec un cas simple.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'templates'))

from base import ScriptBase
from argparse import ArgumentParser
from typing import List, Optional

class ExampleScript(ScriptBase):
    def __init__(self):
        super().__init__("Script d'exemple qui affiche un message personnalisé")

    def _add_arguments(self, parser: ArgumentParser):
        """Ajoute les arguments spécifiques au script."""
        parser.add_argument(
            '--message',
            type=str,
            default='Hello DevToolkit!',
            help='Message à afficher'
        )
        parser.add_argument(
            '--repeat',
            type=int,
            default=1,
            help='Nombre de fois à répéter le message'
        )

    def run(self) -> int:
        """Exécute le script."""
        try:
            for _ in range(self.args.repeat):
                self.logger.info(self.args.message)
            return 0
        except Exception as e:
            self.logger.error(f"Erreur lors de l'exécution: {e}")
            return 1

def main():
    """Point d'entrée principal du script."""
    script = ExampleScript()
    try:
        script.parse_args()
        return script.run()
    except Exception as e:
        print(f"Erreur: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
