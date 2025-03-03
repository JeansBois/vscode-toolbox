#!/usr/bin/env python3
"""
Project Tool Template
------------------
Template spécialisé pour la gestion de projet avec:
- Intégration Git
- Gestion des dépendances
- Validation de structure
- Génération de documentation
- Vérification de qualité
"""

import configparser
import git
import os
import re
import shutil
import subprocess
import toml
from abc import abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Union
import sys

from ..script_template import ScriptBase, ScriptError, ScriptErrorLevel, ScriptHooks

@dataclass
class ProjectConfig:
    """Configuration du projet"""
    name: str
    version: str
    description: str
    author: str
    dependencies: Dict[str, str]
    dev_dependencies: Dict[str, str]
    python_version: str
    
    @classmethod
    def from_pyproject(cls, path: Path) -> 'ProjectConfig':
        """Charge la configuration depuis pyproject.toml"""
        try:
            data = toml.load(path)
            project = data.get('project', {})
            
            return cls(
                name=project.get('name', ''),
                version=project.get('version', '0.1.0'),
                description=project.get('description', ''),
                author=project.get('author', ''),
                dependencies=project.get('dependencies', {}),
                dev_dependencies=project.get('dev-dependencies', {}),
                python_version=project.get('requires-python', '>=3.8')
            )
        except Exception as e:
            raise ScriptError(
                f"Erreur de lecture pyproject.toml: {str(e)}",
                ScriptErrorLevel.ERROR
            )

@dataclass
class GitStatus:
    """État du dépôt Git"""
    branch: str
    modified: List[str]
    untracked: List[str]
    ahead: int
    behind: int
    
    @classmethod
    def from_repo(cls, repo: git.Repo) -> 'GitStatus':
        """Crée le status depuis un dépôt"""
        try:
            # Obtient l'état du dépôt
            branch = repo.active_branch.name
            status = repo.git.status('--porcelain')
            
            # Parse les fichiers modifiés/non suivis
            modified = []
            untracked = []
            for line in status.split('\n'):
                if line:
                    status_code = line[:2]
                    file_path = line[3:]
                    if status_code.startswith('??'):
                        untracked.append(file_path)
                    else:
                        modified.append(file_path)
            
            # Vérifie l'état par rapport à l'origine
            ahead = 0
            behind = 0
            if 'origin' in repo.remotes:
                origin = repo.remotes.origin
                origin.fetch()
                ahead_behind = repo.git.rev_list(
                    '--left-right',
                    '--count',
                    f'{branch}...origin/{branch}'
                ).split()
                if len(ahead_behind) == 2:
                    ahead, behind = map(int, ahead_behind)
            
            return cls(
                branch=branch,
                modified=modified,
                untracked=untracked,
                ahead=ahead,
                behind=behind
            )
            
        except Exception as e:
            raise ScriptError(
                f"Erreur d'obtention du status git: {str(e)}",
                ScriptErrorLevel.ERROR
            )

class ProjectValidator:
    """Validateur de structure de projet"""
    
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.issues: List[str] = []
        
    def validate_structure(self) -> bool:
        """Valide la structure du projet"""
        # Vérifie les fichiers essentiels
        required_files = [
            'pyproject.toml',
            'README.md',
            '.gitignore'
        ]
        
        for file in required_files:
            if not (self.project_root / file).exists():
                self.issues.append(f"Fichier requis manquant: {file}")
        
        # Vérifie la structure des répertoires
        required_dirs = [
            'src',
            'tests',
            'docs'
        ]
        
        for dir_name in required_dirs:
            if not (self.project_root / dir_name).is_dir():
                self.issues.append(f"Répertoire requis manquant: {dir_name}")
        
        # Vérifie les fichiers Python
        for py_file in self.project_root.rglob('*.py'):
            if not self._validate_python_file(py_file):
                self.issues.append(f"Problèmes dans le fichier: {py_file}")
        
        return len(self.issues) == 0
    
    def _validate_python_file(self, path: Path) -> bool:
        """Valide un fichier Python individuel"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Vérifie la présence de docstring
            if not re.search(r'"""[\s\S]*?"""', content):
                self.issues.append(f"{path}: Docstring manquante")
            
            # Vérifie les imports
            if 'import *' in content:
                self.issues.append(f"{path}: Wildcard import déconseillé")
            
            # Vérifie la longueur des lignes
            for i, line in enumerate(content.splitlines(), 1):
                if len(line) > 100:
                    self.issues.append(
                        f"{path}:{i}: Ligne trop longue ({len(line)} > 100)"
                    )
            
            return True
        except Exception:
            return False

class ProjectTool(ScriptBase[Path, Dict[str, Any]], ScriptHooks):
    """Base pour les outils de gestion de projet"""
    
    def __init__(self):
        super().__init__()
        self.project_root: Optional[Path] = None
        self.config: Optional[ProjectConfig] = None
        self.repo: Optional[git.Repo] = None
        
    def pre_validate(self) -> bool:
        """Vérifie l'environnement du projet"""
        self.logger.info("Validation de l'environnement...")
        
        try:
            # Vérifie le répertoire du projet
            self.project_root = Path(self.args.project_path)
            if not self.project_root.is_dir():
                raise ScriptError(
                    "Répertoire de projet invalide",
                    ScriptErrorLevel.ERROR
                )
            
            # Charge la configuration
            pyproject_path = self.project_root / 'pyproject.toml'
            if pyproject_path.exists():
                self.config = ProjectConfig.from_pyproject(pyproject_path)
            
            # Initialise Git si nécessaire
            try:
                self.repo = git.Repo(self.project_root)
            except git.InvalidGitRepositoryError:
                if getattr(self.args, 'init_git', False):
                    self.repo = git.Repo.init(self.project_root)
                
            return True
            
        except Exception as e:
            self.logger.error(f"Validation échouée: {str(e)}")
            return False
        
    def post_validate(self, success: bool) -> None:
        """Post-validation"""
        status = "succès" if success else "échec"
        self.logger.info(f"Validation terminée: {status}")
        
    def pre_execute(self) -> bool:
        """Préparation des opérations"""
        self.logger.info("Préparation des opérations...")
        return True
        
    def post_execute(self, success: bool) -> None:
        """Nettoyage post-opérations"""
        status = "succès" if success else "échec"
        self.logger.info(f"Opérations terminées: {status}")
    
    def create_virtual_env(self) -> bool:
        """Crée un environnement virtuel"""
        try:
            venv_path = self.project_root / '.venv'
            if not venv_path.exists():
                subprocess.run(
                    ['python', '-m', 'venv', str(venv_path)],
                    check=True
                )
                self.logger.info(f"Environnement virtuel créé: {venv_path}")
            return True
        except Exception as e:
            self.logger.error(f"Erreur création venv: {str(e)}")
            return False
    
    def install_dependencies(self) -> bool:
        """Installe les dépendances du projet"""
        try:
            if self.config and self.config.dependencies:
                requirements = [
                    f"{name}{version}"
                    for name, version in self.config.dependencies.items()
                ]
                
                subprocess.run(
                    ['pip', 'install'] + requirements,
                    check=True
                )
                self.logger.info("Dépendances installées")
            return True
        except Exception as e:
            self.logger.error(f"Erreur installation: {str(e)}")
            return False
    
    def generate_documentation(self) -> bool:
        """Génère la documentation du projet"""
        try:
            docs_dir = self.project_root / 'docs'
            docs_dir.mkdir(exist_ok=True)
            
            # Exemple avec sphinx-quickstart
            if not (docs_dir / 'conf.py').exists():
                subprocess.run(
                    ['sphinx-quickstart', '-q', '-p', self.config.name,
                     '-a', self.config.author, '-v', self.config.version,
                     '-r', self.config.version, '-l', 'fr',
                     '--ext-autodoc', '--ext-viewcode',
                     '--makefile', '--batchfile',
                     str(docs_dir)],
                    check=True
                )
            
            # Génère la documentation
            subprocess.run(
                ['sphinx-build', '-b', 'html', 'docs', 'docs/_build/html'],
                cwd=self.project_root,
                check=True
            )
            
            self.logger.info("Documentation générée")
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur génération docs: {str(e)}")
            return False
    
    def execute(self) -> bool:
        """Exécute les opérations sur le projet"""
        try:
            # Validation du projet
            validator = ProjectValidator(self.project_root)
            step_validate = self.progress.add_step(1, "Validation du projet")
            
            if not validator.validate_structure():
                self.logger.warning(
                    "Problèmes détectés:\n" + "\n".join(validator.issues)
                )
            self.progress.update(step_validate)
            
            # Configuration de l'environnement
            step_env = self.progress.add_step(2, "Configuration environnement")
            
            if self.create_virtual_env():
                self.progress.update(step_env)
                
            if self.install_dependencies():
                self.progress.update(step_env)
            
            # Gestion Git
            if self.repo:
                step_git = self.progress.add_step(1, "Vérification Git")
                status = GitStatus.from_repo(self.repo)
                
                if status.modified or status.untracked:
                    self.logger.warning(
                        f"Fichiers non commités: "
                        f"{len(status.modified)} modifiés, "
                        f"{len(status.untracked)} non suivis"
                    )
                
                if status.ahead > 0:
                    self.logger.warning(
                        f"{status.ahead} commits en avance sur origin"
                    )
                if status.behind > 0:
                    self.logger.warning(
                        f"{status.behind} commits en retard sur origin"
                    )
                    
                self.progress.update(step_git)
            
            # Génération documentation
            step_docs = self.progress.add_step(1, "Génération documentation")
            if self.generate_documentation():
                self.progress.update(step_docs)
            
            # Génère le rapport
            report = {
                "timestamp": datetime.now().isoformat(),
                "project": {
                    "name": self.config.name if self.config else "Unknown",
                    "version": self.config.version if self.config else "0.0.0",
                    "path": str(self.project_root)
                },
                "validation": {
                    "success": len(validator.issues) == 0,
                    "issues": validator.issues
                },
                "git_status": {
                    "branch": status.branch,
                    "modified": len(status.modified),
                    "untracked": len(status.untracked),
                    "ahead": status.ahead,
                    "behind": status.behind
                } if self.repo else None
            }
            
            # Génération sortie
            self.generate_output(report)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur d'exécution: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    tool = ProjectTool()
    sys.exit(tool.run())

if __name__ == "__main__":
    main()
