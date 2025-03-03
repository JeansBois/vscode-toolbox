#!/usr/bin/env python3
"""
Template de base pour les scripts DevToolkit.
Ce template inclut une structure de base avec gestion des arguments
et logging configuré.
"""

import argparse
import logging
import sys
from typing import List, Optional

class ScriptBase:
    def __init__(self, description: str):
        """
        Initialise le script avec une description.
        
        Args:
            description: Description du script pour l'aide
        """
        self.logger = self._setup_logging()
        self.parser = self._setup_argument_parser(description)
        self.args = None

    def _setup_logging(self) -> logging.Logger:
        """Configure le système de logging."""
        logger = logging.getLogger(__name__)
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        return logger

    def _setup_argument_parser(self, description: str) -> argparse.ArgumentParser:
        """Configure le parseur d'arguments."""
        parser = argparse.ArgumentParser(description=description)
        self._add_arguments(parser)
        return parser

    def _add_arguments(self, parser: argparse.ArgumentParser):
        """
        Ajoute les arguments spécifiques au script.
        À surcharger dans les classes enfants.
        """
        pass

    def parse_args(self, args: Optional[List[str]] = None):
        """Parse les arguments de la ligne de commande."""
        self.args = self.parser.parse_args(args)

    def run(self) -> int:
        """
        Exécute le script.
        À surcharger dans les classes enfants.
        
        Returns:
            int: Code de retour (0 pour succès, autre pour erreur)
        """
        raise NotImplementedError("La méthode run() doit être implémentée")

def main():
    """Point d'entrée principal du script."""
    script = ScriptBase("Description du script")
    try:
        script.parse_args()
        return script.run()
    except Exception as e:
        script.logger.error(f"Erreur: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
