#!/usr/bin/env python3
"""
Dependency Checker
---------------
Outil pour gérer les dépendances des templates avec:
- Vérification des versions
- Résolution des conflits
- Génération de requirements.txt
- Validation de compatibilité
"""

import ast
import importlib
import json
import pkg_resources
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
import re

from ..script_template import ScriptBase, ScriptError, ScriptErrorLevel

@dataclass
class Dependency:
    """Information sur une dépendance"""
    name: str
    version_spec: str
    installed_version: Optional[str] = None
    is_compatible: bool = True
    conflicts: List[str] = field(default_factory=list)

@dataclass
class DependencyCheck:
    """Résultat de vérification des dépendances"""
    dependencies: List[Dependency]
    missing: List[str]
    outdated: List[Tuple[str, str, str]]  # (name, current, required)
    conflicts: List[Tuple[str, str, str]]  # (name, dep1, dep2)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le résultat en dictionnaire"""
        return {
            "dependencies": [
                {
                    "name": dep.name,
                    "version_spec": dep.version_spec,
                    "installed": dep.installed_version,
                    "compatible": dep.is_compatible,
                    "conflicts": dep.conflicts
                }
                for dep in self.dependencies
            ],
            "missing": self.missing,
            "outdated": [
                {
                    "name": name,
                    "current": current,
                    "required": required
                }
                for name, current, required in self.outdated
            ],
            "conflicts": [
                {
                    "package": name,
                    "dependency1": dep1,
                    "dependency2": dep2
                }
                for name, dep1, dep2 in self.conflicts
            ]
        }

class DependencyAnalyzer:
    """Analyseur de dépendances"""
    
    def __init__(self):
        self.installed_packages = {
            dist.project_name: dist.version
            for dist in pkg_resources.working_set
        }
    
    def check_manifest(self, manifest_path: Path) -> DependencyCheck:
        """Vérifie les dépendances d'un manifest"""
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            
            dependencies = []
            missing = []
            outdated = []
            conflicts = []
            
            # Vérifie les dépendances listées
            for dep_name in manifest['execution']['dependencies']:
                version_spec = '*'  # Par défaut
                
                # Vérifie si installé
                if dep_name not in self.installed_packages:
                    missing.append(dep_name)
                    dependencies.append(Dependency(dep_name, version_spec))
                    continue
                
                installed_version = self.installed_packages[dep_name]
                
                # Vérifie la compatibilité de version
                try:
                    if version_spec != '*':
                        spec = pkg_resources.Requirement.parse(
                            f"{dep_name}{version_spec}"
                        )
                        if installed_version not in spec:
                            outdated.append(
                                (dep_name, installed_version, version_spec)
                            )
                    
                    dependencies.append(
                        Dependency(
                            dep_name,
                            version_spec,
                            installed_version,
                            True
                        )
                    )
                    
                except Exception:
                    dependencies.append(
                        Dependency(
                            dep_name,
                            version_spec,
                            installed_version,
                            False
                        )
                    )
            
            # Vérifie les conflits entre dépendances
            self._check_conflicts(dependencies, conflicts)
            
            return DependencyCheck(
                dependencies=dependencies,
                missing=missing,
                outdated=outdated,
                conflicts=conflicts
            )
            
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse des dépendances: {str(e)}",
                ScriptErrorLevel.ERROR
            )
    
    def check_script(self, script_path: Path) -> DependencyCheck:
        """Analyse les dépendances d'un script"""
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                tree = ast.parse(f.read())
            
            dependencies = []
            missing = []
            outdated = []
            conflicts = []
            
            # Extrait les imports
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for name in node.names:
                        dep_name = name.name.split('.')[0]
                        if not self._is_stdlib_module(dep_name):
                            self._check_dependency(
                                dep_name,
                                dependencies,
                                missing
                            )
                            
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        dep_name = node.module.split('.')[0]
                        if not self._is_stdlib_module(dep_name):
                            self._check_dependency(
                                dep_name,
                                dependencies,
                                missing
                            )
            
            # Vérifie les conflits
            self._check_conflicts(dependencies, conflicts)
            
            return DependencyCheck(
                dependencies=dependencies,
                missing=missing,
                outdated=outdated,
                conflicts=conflicts
            )
            
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse du script: {str(e)}",
                ScriptErrorLevel.ERROR
            )
    
    def _is_stdlib_module(self, name: str) -> bool:
        """Vérifie si un module est dans la bibliothèque standard"""
        try:
            module_path = importlib.util.find_spec(name)
            if module_path is None:
                return False
            return 'site-packages' not in str(module_path.origin)
        except Exception:
            return False
    
    def _check_dependency(
        self,
        name: str,
        dependencies: List[Dependency],
        missing: List[str]
    ):
        """Vérifie une dépendance individuelle"""
        if name not in self.installed_packages:
            missing.append(name)
            dependencies.append(Dependency(name, '*'))
        else:
            dependencies.append(
                Dependency(
                    name,
                    '*',
                    self.installed_packages[name],
                    True
                )
            )
    
    def _check_conflicts(
        self,
        dependencies: List[Dependency],
        conflicts: List[Tuple[str, str, str]]
    ):
        """Vérifie les conflits entre dépendances"""
        for i, dep1 in enumerate(dependencies):
            for dep2 in dependencies[i+1:]:
                if dep1.name == dep2.name:
                    continue
                    
                try:
                    # Vérifie si les deux packages peuvent être installés ensemble
                    subprocess.run(
                        [
                            'pip', 'check',
                            f"{dep1.name}=={dep1.installed_version}",
                            f"{dep2.name}=={dep2.installed_version}"
                        ],
                        check=True,
                        capture_output=True
                    )
                except subprocess.CalledProcessError:
                    conflicts.append(
                        (
                            f"{dep1.name}=={dep1.installed_version}",
                            f"{dep2.name}=={dep2.installed_version}",
                            "Conflit de dépendances"
                        )
                    )
                    dep1.conflicts.append(dep2.name)
                    dep2.conflicts.append(dep1.name)

class DependencyChecker(ScriptBase[Path, Dict[str, Any]]):
    """Vérificateur de dépendances pour les scripts"""
    
    def execute(self) -> bool:
        """Exécute la vérification des dépendances"""
        try:
            path = Path(self.args.path)
            analyzer = DependencyAnalyzer()
            
            # Détermine le type de fichier
            if path.suffix == '.json':
                # Crée une étape de progression
                step = self.progress.add_step(1, "Analyse du manifest")
                self.logger.info(f"Analyse du manifest: {path}")
                result = analyzer.check_manifest(path)
                self.progress.update(step)
                
            else:
                # Crée une étape de progression
                step = self.progress.add_step(1, "Analyse du script")
                self.logger.info(f"Analyse du script: {path}")
                result = analyzer.check_script(path)
                self.progress.update(step)
            
            # Affiche les résultats
            if result.missing:
                self.logger.warning(
                    "Dépendances manquantes: " +
                    ", ".join(result.missing)
                )
            
            if result.outdated:
                self.logger.warning("Dépendances obsolètes:")
                for name, current, required in result.outdated:
                    self.logger.warning(
                        f"- {name}: {current} -> {required}"
                    )
            
            if result.conflicts:
                self.logger.error("Conflits détectés:")
                for name, dep1, dep2 in result.conflicts:
                    self.logger.error(
                        f"- Conflit entre {dep1} et {dep2}"
                    )
            
            # Génère requirements.txt si demandé
            if getattr(self.args, 'generate_requirements', False):
                requirements_path = path.parent / 'requirements.txt'
                with open(requirements_path, 'w', encoding='utf-8') as f:
                    for dep in result.dependencies:
                        if dep.installed_version:
                            f.write(f"{dep.name}=={dep.installed_version}\n")
                        else:
                            f.write(f"{dep.name}\n")
                self.logger.info(
                    f"requirements.txt généré: {requirements_path}"
                )
            
            # Génère le rapport
            report = result.to_dict()
            self.generate_output(report)
            
            return not (result.missing or result.conflicts)
            
        except Exception as e:
            self.logger.error(f"Erreur de vérification: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    checker = DependencyChecker()
    sys.exit(checker.run())

if __name__ == "__main__":
    main()
