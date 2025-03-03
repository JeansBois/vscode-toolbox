#!/usr/bin/env python3
"""
Template Validator
---------------
Outil pour valider les implémentations de templates avec:
- Vérification de la conformité
- Tests des hooks
- Validation des types
- Analyse de la documentation
"""

import ast
import importlib.util
import inspect
import sys
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Type, get_type_hints
import json

from ..script_template import (
    ScriptBase, ScriptError, ScriptErrorLevel,
    ScriptHooks
)

@dataclass
class ValidationResult:
    """Résultat de validation d'un script"""
    script_path: Path
    is_valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    info: Dict[str, Any] = field(default_factory=dict)
    
    def add_error(self, message: str):
        """Ajoute une erreur"""
        self.errors.append(message)
        self.is_valid = False
    
    def add_warning(self, message: str):
        """Ajoute un avertissement"""
        self.warnings.append(message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le résultat en dictionnaire"""
        return {
            "script": str(self.script_path),
            "valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "info": self.info
        }

class ScriptValidator:
    """Validateur de scripts"""
    
    def __init__(self, script_path: Path):
        self.script_path = script_path
        self.result = ValidationResult(script_path, True)
        self.tree: Optional[ast.AST] = None
        self.module: Optional[Any] = None
        self.script_class: Optional[Type] = None
        
    def validate(self) -> ValidationResult:
        """Validation complète du script"""
        try:
            # Charge le module
            self._load_module()
            
            # Parse le code source
            with open(self.script_path, 'r', encoding='utf-8') as f:
                self.tree = ast.parse(f.read())
            
            # Exécute les validations
            self._validate_imports()
            self._validate_class_structure()
            self._validate_types()
            self._validate_documentation()
            self._validate_hooks()
            
            return self.result
            
        except Exception as e:
            self.result.add_error(f"Erreur de validation: {str(e)}")
            return self.result
    
    def _load_module(self):
        """Charge le module Python"""
        try:
            spec = importlib.util.spec_from_file_location(
                self.script_path.stem,
                self.script_path
            )
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
            
            # Trouve la classe de script
            for item in dir(self.module):
                obj = getattr(self.module, item)
                if (
                    isinstance(obj, type) and
                    issubclass(obj, ScriptBase) and
                    obj != ScriptBase
                ):
                    self.script_class = obj
                    break
            
            if not self.script_class:
                self.result.add_error(
                    "Aucune classe héritant de ScriptBase trouvée"
                )
            
        except Exception as e:
            self.result.add_error(f"Erreur de chargement du module: {str(e)}")
    
    def _validate_imports(self):
        """Valide les imports"""
        required_imports = {'typing', 'pathlib', 'logging'}
        found_imports = set()
        
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    found_imports.add(name.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    found_imports.add(node.module.split('.')[0])
        
        missing = required_imports - found_imports
        if missing:
            self.result.add_warning(
                f"Imports recommandés manquants: {', '.join(missing)}"
            )
    
    def _validate_class_structure(self):
        """Valide la structure de la classe"""
        if not self.script_class:
            return
            
        # Vérifie les méthodes requises
        required_methods = {'execute', 'run'}
        class_methods = set(
            name for name, _ in inspect.getmembers(self.script_class, inspect.isfunction)
        )
        
        missing = required_methods - class_methods
        if missing:
            self.result.add_error(
                f"Méthodes requises manquantes: {', '.join(missing)}"
            )
        
        # Vérifie l'héritage
        if not any(
            base.__name__ == 'ScriptBase'
            for base in self.script_class.__bases__
        ):
            self.result.add_error(
                "La classe doit hériter directement de ScriptBase"
            )
    
    def _validate_types(self):
        """Valide les annotations de type"""
        if not self.script_class:
            return
            
        # Vérifie les annotations de la classe
        try:
            type_hints = get_type_hints(self.script_class)
            
            # Vérifie execute()
            if 'execute' in type_hints:
                if type_hints['execute'] != bool:
                    self.result.add_error(
                        "execute() doit retourner bool"
                    )
            else:
                self.result.add_warning(
                    "execute() manque d'annotation de type de retour"
                )
            
        except Exception as e:
            self.result.add_warning(f"Erreur validation types: {str(e)}")
    
    def _validate_documentation(self):
        """Valide la documentation"""
        if not self.script_class:
            return
            
        # Vérifie la docstring de la classe
        if not self.script_class.__doc__:
            self.result.add_warning("Documentation de classe manquante")
        
        # Vérifie les docstrings des méthodes
        for name, method in inspect.getmembers(
            self.script_class,
            inspect.isfunction
        ):
            if not name.startswith('_') and not method.__doc__:
                self.result.add_warning(
                    f"Documentation manquante pour {name}()"
                )
    
    def _validate_hooks(self):
        """Valide l'implémentation des hooks"""
        if not self.script_class:
            return
            
        # Vérifie si la classe implémente ScriptHooks
        implements_hooks = issubclass(self.script_class, ScriptHooks)
        
        if implements_hooks:
            # Vérifie l'implémentation des méthodes de hook
            hook_methods = {
                'pre_validate',
                'post_validate',
                'pre_execute',
                'post_execute'
            }
            
            implemented = set(
                name for name, _ in inspect.getmembers(
                    self.script_class,
                    inspect.isfunction
                )
            )
            
            missing = hook_methods - implemented
            if missing:
                self.result.add_warning(
                    f"Hooks non implémentés: {', '.join(missing)}"
                )
            
            # Test des hooks
            try:
                instance = self.script_class()
                
                # Test pre_validate
                if hasattr(instance, 'pre_validate'):
                    result = instance.pre_validate()
                    if not isinstance(result, bool):
                        self.result.add_error(
                            "pre_validate() doit retourner bool"
                        )
                
                # Test pre_execute
                if hasattr(instance, 'pre_execute'):
                    result = instance.pre_execute()
                    if not isinstance(result, bool):
                        self.result.add_error(
                            "pre_execute() doit retourner bool"
                        )
                
            except Exception as e:
                self.result.add_error(f"Erreur test hooks: {str(e)}")

class TemplateValidator(ScriptBase[Path, Dict[str, Any]]):
    """Validateur de templates de script"""
    
    def execute(self) -> bool:
        """Exécute la validation"""
        try:
            script_path = Path(self.args.script_path)
            
            # Crée une étape de progression
            step = self.progress.add_step(1, "Validation du script")
            
            # Valide le script
            self.logger.info(f"Validation du script: {script_path}")
            validator = ScriptValidator(script_path)
            result = validator.validate()
            
            # Mise à jour progression
            self.progress.update(step)
            
            # Affiche les résultats
            if result.errors:
                self.logger.error("Erreurs trouvées:")
                for error in result.errors:
                    self.logger.error(f"- {error}")
            
            if result.warnings:
                self.logger.warning("Avertissements:")
                for warning in result.warnings:
                    self.logger.warning(f"- {warning}")
            
            if result.is_valid:
                self.logger.info("Script valide!")
            
            # Génère le rapport
            report = result.to_dict()
            self.generate_output(report)
            
            return result.is_valid
            
        except Exception as e:
            self.logger.error(f"Erreur de validation: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    validator = TemplateValidator()
    sys.exit(validator.run())

if __name__ == "__main__":
    main()
