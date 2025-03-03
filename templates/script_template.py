#!/usr/bin/env python3
"""
DevToolBox Script Template
-------------------------
Template amélioré pour la création de scripts DevToolBox avec:
- Type hints complets
- Hooks template
- Support asynchrone
- Gestion d'erreurs avancée
- Reporting de progression
- Configuration de logging avancée

Usage:
1. Copier ce template pour créer un nouveau script
2. Créer un fichier manifest suivant le format script_manifest.json
3. Implémenter les méthodes requises
4. Mettre à jour le manifest avec les informations du script
"""

import argparse
import asyncio
import json
import logging
import logging.handlers
import os
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import (
    Any, Dict, Generic, List, Optional, TypeVar, Union,
    Protocol, runtime_checkable
)

# Types génériques pour les données d'entrée/sortie
InputT = TypeVar('InputT')
OutputT = TypeVar('OutputT')

class ScriptErrorLevel(Enum):
    """Niveaux d'erreur pour la classification"""
    FATAL = "fatal"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"

@dataclass
class ScriptError(Exception):
    """Exception enrichie pour les erreurs de script"""
    message: str
    level: ScriptErrorLevel
    details: Optional[Dict[str, Any]] = None
    
    def __str__(self) -> str:
        return f"{self.level.value.upper()}: {self.message}"

@dataclass
class Progress:
    """Structure de données pour le suivi de progression"""
    current: int
    total: int
    message: str
    substeps: List['Progress'] = None
    
    @property
    def percentage(self) -> float:
        """Calcule le pourcentage de progression"""
        return (self.current / self.total) * 100 if self.total > 0 else 0

class ProgressTracker:
    """Gestionnaire de progression avec support pour les sous-étapes"""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.steps: List[Progress] = []
        
    def add_step(self, total: int, message: str) -> Progress:
        """Ajoute une nouvelle étape au suivi"""
        step = Progress(0, total, message)
        self.steps.append(step)
        return step
        
    def update(self, step: Progress, increment: int = 1):
        """Met à jour la progression d'une étape"""
        step.current = min(step.current + increment, step.total)
        self._log_progress(step)
        
    def _log_progress(self, step: Progress):
        """Enregistre la progression dans les logs"""
        self.logger.info(
            f"Progress: {step.percentage:.1f}% - {step.message} "
            f"({step.current}/{step.total})"
        )

@runtime_checkable
class ScriptHooks(Protocol):
    """Protocol définissant les hooks disponibles"""
    
    def pre_validate(self) -> bool:
        """Hook exécuté avant la validation"""
        ...
        
    def post_validate(self, success: bool) -> None:
        """Hook exécuté après la validation"""
        ...
        
    def pre_execute(self) -> bool:
        """Hook exécuté avant l'exécution"""
        ...
        
    def post_execute(self, success: bool) -> None:
        """Hook exécuté après l'exécution"""
        ...

class ScriptBase(Generic[InputT, OutputT], ABC):
    """Classe de base améliorée pour tous les scripts DevToolBox"""
    
    def __init__(self, manifest_path: Optional[str] = None):
        """
        Initialise le script avec un chemin de manifest optionnel.
        
        Args:
            manifest_path: Chemin vers le fichier manifest. Si non fourni,
                         cherche dans le répertoire du script.
        """
        self.script_dir = Path(__file__).parent
        self.manifest_path = Path(manifest_path or self.script_dir / "script_manifest.json")
        
        # Initialisation des composants
        self._setup_logging()
        self.manifest = self._load_manifest()
        self.args = self._parse_arguments()
        self.progress = ProgressTracker(self.logger)
        
    def _setup_logging(self) -> None:
        """Configure le logging avec rotation des fichiers"""
        self.logger = logging.getLogger(self.manifest_path.stem)
        
        # Handler console avec formatage
        console_handler = logging.StreamHandler()
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        
        # Handler fichier avec rotation
        log_dir = self.script_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            log_dir / f"{self.manifest_path.stem}.log",
            maxBytes=1024 * 1024,  # 1MB
            backupCount=5
        )
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(pathname)s:%(lineno)d'
        )
        file_handler.setFormatter(file_formatter)
        
        # Configuration du logger
        self.logger.addHandler(console_handler)
        self.logger.addHandler(file_handler)
        self.logger.setLevel(logging.INFO)
        
    def _load_manifest(self) -> Dict[str, Any]:
        """Charge et valide le manifest du script"""
        try:
            with open(self.manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                
            # Validation des sections requises
            required_sections = ['script_info', 'execution', 'interface']
            missing = [s for s in required_sections if s not in manifest]
            if missing:
                raise ScriptError(
                    f"Sections manquantes dans le manifest: {', '.join(missing)}",
                    ScriptErrorLevel.FATAL
                )
                    
            return manifest
            
        except FileNotFoundError:
            raise ScriptError(
                f"Manifest non trouvé: {self.manifest_path}",
                ScriptErrorLevel.FATAL
            )
        except json.JSONDecodeError as e:
            raise ScriptError(
                f"JSON manifest invalide: {str(e)}",
                ScriptErrorLevel.FATAL,
                {"line": e.lineno, "column": e.colno}
            )
            
    def _parse_arguments(self) -> argparse.Namespace:
        """Parse les arguments en ligne de commande basés sur le manifest"""
        parser = argparse.ArgumentParser(
            description=self.manifest['script_info']['description']
        )
        
        # Ajout des arguments basés sur les inputs du manifest
        for input_def in self.manifest['interface']['inputs']:
            arg_name = f"--{input_def['name']}"
            
            # Détermine le type d'argument
            arg_type = {
                'string': str,
                'number': float,
                'integer': int,
                'boolean': bool,
                'file': str,
                'directory': str
            }.get(input_def['type'], str)
            
            # Configure l'argument
            parser.add_argument(
                arg_name,
                type=arg_type,
                help=input_def['description'],
                required=input_def['required'],
                default=input_def.get('default')
            )
            
        return parser.parse_args()
        
    def validate_inputs(self) -> bool:
        """Valide tous les paramètres d'entrée"""
        try:
            # Hook pre-validation
            if isinstance(self, ScriptHooks):
                if not self.pre_validate():
                    return False
            
            for input_def in self.manifest['interface']['inputs']:
                value = getattr(self.args, input_def['name'])
                
                # Skip validation si optionnel et non fourni
                if not input_def['required'] and value is None:
                    continue
                    
                # Validation basée sur le type
                if input_def['type'] in ['file', 'directory']:
                    path = Path(value)
                    if input_def['type'] == 'file':
                        if not path.is_file():
                            raise ScriptError(
                                f"Fichier d'entrée non trouvé: {value}",
                                ScriptErrorLevel.ERROR
                            )
                    else:
                        if not path.is_dir():
                            raise ScriptError(
                                f"Répertoire d'entrée non trouvé: {value}",
                                ScriptErrorLevel.ERROR
                            )
                            
            # Hook post-validation
            if isinstance(self, ScriptHooks):
                self.post_validate(True)
                
            return True
            
        except Exception as e:
            self.logger.error(f"Validation échouée: {str(e)}")
            if isinstance(self, ScriptHooks):
                self.post_validate(False)
            return False
            
    @abstractmethod
    def execute(self) -> bool:
        """
        Logique principale d'exécution - à implémenter par la classe enfant.
        
        Returns:
            bool: True si exécution réussie, False sinon
        """
        raise NotImplementedError("Implémenter execute() dans votre classe")
        
    def generate_output(self, data: OutputT, output_type: str = "console") -> None:
        """
        Génère la sortie du script selon le manifest.
        
        Args:
            data: Données à sortir
            output_type: Type de sortie (console, file)
        """
        try:
            if output_type == "console":
                if isinstance(data, (dict, list)):
                    print(json.dumps(data, indent=2, ensure_ascii=False))
                else:
                    print(str(data))
            elif output_type == "file":
                output_file = getattr(self.args, 'output_file', None)
                if output_file:
                    with open(output_file, 'w', encoding='utf-8') as f:
                        if isinstance(data, (dict, list)):
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        else:
                            f.write(str(data))
                    self.logger.info(f"Sortie écrite dans: {output_file}")
                    
        except Exception as e:
            raise ScriptError(
                f"Erreur de génération de sortie: {str(e)}",
                ScriptErrorLevel.ERROR
            )
            
    def run(self) -> int:
        """
        Point d'entrée principal avec workflow standard.
        
        Returns:
            int: Code de sortie (0 pour succès, 1 pour échec)
        """
        try:
            self.logger.info(f"Démarrage {self.manifest['script_info']['name']}")
            
            # Hook pre-execute
            if isinstance(self, ScriptHooks):
                if not self.pre_execute():
                    return 1
            
            # Validation des entrées
            if not self.validate_inputs():
                return 1
                
            # Exécution logique principale
            success = self.execute()
            
            # Hook post-execute
            if isinstance(self, ScriptHooks):
                self.post_execute(success)
            
            if not success:
                return 1
                
            self.logger.info("Script terminé avec succès")
            return 0
            
        except Exception as e:
            self.logger.error(f"Script échoué: {str(e)}")
            if isinstance(self, ScriptHooks):
                self.post_execute(False)
            return 1

class AsyncScriptBase(ScriptBase[InputT, OutputT], ABC):
    """Version asynchrone de la classe de base pour les scripts"""
    
    @abstractmethod
    async def execute_async(self) -> bool:
        """
        Version asynchrone de la méthode execute.
        À implémenter par la classe enfant.
        
        Returns:
            bool: True si exécution réussie, False sinon
        """
        raise NotImplementedError("Implémenter execute_async() dans votre classe")
        
    def execute(self) -> bool:
        """Wrapper synchrone pour execute_async"""
        return asyncio.run(self.execute_async())

# Exemple d'implémentation
class ExampleScript(ScriptBase[str, Dict[str, Any]], ScriptHooks):
    """Exemple d'implémentation d'un script utilisant le template"""
    
    def pre_validate(self) -> bool:
        self.logger.info("Pré-validation...")
        return True
        
    def post_validate(self, success: bool) -> None:
        self.logger.info(f"Post-validation: {'succès' if success else 'échec'}")
        
    def pre_execute(self) -> bool:
        self.logger.info("Pré-exécution...")
        return True
        
    def post_execute(self, success: bool) -> None:
        self.logger.info(f"Post-exécution: {'succès' if success else 'échec'}")
    
    def execute(self) -> bool:
        """Implémente la logique spécifique au script"""
        try:
            # Exemple d'implémentation
            self.logger.info("Démarrage exécution...")
            
            # Accès aux arguments validés
            input_path = self.args.input_path
            verbose = getattr(self.args, 'verbose', False)
            
            if verbose:
                self.logger.info(f"Traitement entrée: {input_path}")
            
            # Exemple de suivi de progression
            step = self.progress.add_step(100, "Traitement des données")
            
            # Simulation de traitement
            for i in range(100):
                # Votre logique ici
                self.progress.update(step)
            
            result = {"status": "success", "message": "Script exécuté avec succès"}
            
            # Génération sortie
            self.generate_output(result)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Exécution échouée: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    script = ExampleScript()
    sys.exit(script.run())

if __name__ == "__main__":
    main()
