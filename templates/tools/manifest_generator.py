#!/usr/bin/env python3
"""
Manifest Generator
---------------
Outil pour générer automatiquement les manifests de script avec:
- Analyse statique du code
- Détection des dépendances
- Documentation auto-générée
- Validation de conformité
"""

import ast
import importlib
import inspect
import pkgutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Type
import json

from ..script_template import ScriptBase, ScriptError, ScriptErrorLevel

@dataclass
class ScriptInfo:
    """Information extraite d'un script"""
    name: str
    description: str
    author: str = ""
    version: str = "0.1.0"
    category: str = "utility"
    tags: List[str] = field(default_factory=list)
    dependencies: Set[str] = field(default_factory=set)
    python_version: str = ">=3.8"
    inputs: List[Dict[str, Any]] = field(default_factory=list)
    outputs: List[Dict[str, Any]] = field(default_factory=list)

class ScriptAnalyzer:
    """Analyseur de scripts Python"""
    
    def __init__(self, script_path: Path):
        self.script_path = script_path
        self.tree: Optional[ast.AST] = None
        self.info = ScriptInfo(
            name=script_path.stem,
            description=""
        )
        
    def analyze(self) -> ScriptInfo:
        """Analyse complète du script"""
        try:
            # Parse le fichier
            with open(self.script_path, 'r', encoding='utf-8') as f:
                self.tree = ast.parse(f.read())
            
            # Extraction des informations
            self._extract_docstring()
            self._extract_imports()
            self._extract_class_info()
            
            return self.info
            
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse du script: {str(e)}",
                ScriptErrorLevel.ERROR
            )
    
    def _extract_docstring(self):
        """Extrait les informations de la docstring"""
        if (
            isinstance(self.tree.body[0], ast.Expr) and
            isinstance(self.tree.body[0].value, ast.Str)
        ):
            docstring = self.tree.body[0].value.s
            
            # Parse la docstring
            lines = docstring.split('\n')
            if lines:
                # Premier paragraphe comme description
                description = []
                for line in lines[1:]:  # Skip title
                    if not line.strip():
                        break
                    description.append(line.strip())
                self.info.description = ' '.join(description)
                
                # Recherche des métadonnées
                for line in lines:
                    line = line.strip()
                    if line.startswith('@author:'):
                        self.info.author = line.split(':', 1)[1].strip()
                    elif line.startswith('@version:'):
                        self.info.version = line.split(':', 1)[1].strip()
                    elif line.startswith('@category:'):
                        self.info.category = line.split(':', 1)[1].strip()
                    elif line.startswith('@tags:'):
                        tags = line.split(':', 1)[1].strip()
                        self.info.tags = [t.strip() for t in tags.split(',')]
    
    def _extract_imports(self):
        """Extrait les dépendances des imports"""
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    if not name.name.startswith('.'):
                        self.info.dependencies.add(name.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module and not node.module.startswith('.'):
                    self.info.dependencies.add(node.module.split('.')[0])
    
    def _extract_class_info(self):
        """Extrait les informations des classes"""
        for node in ast.walk(self.tree):
            if isinstance(node, ast.ClassDef):
                # Vérifie si c'est une sous-classe de ScriptBase
                if any(
                    isinstance(base, ast.Name) and
                    base.id == 'ScriptBase'
                    for base in node.bases
                ):
                    self._analyze_script_class(node)
    
    def _analyze_script_class(self, node: ast.ClassDef):
        """Analyse une classe de script"""
        for subnode in ast.walk(node):
            if isinstance(subnode, ast.FunctionDef):
                if subnode.name == 'execute':
                    self._extract_io_info(subnode)
    
    def _extract_io_info(self, node: ast.FunctionDef):
        """Extrait les informations d'entrée/sortie"""
        # Analyse les annotations de type
        if node.returns:
            if isinstance(node.returns, ast.Name):
                self.info.outputs.append({
                    "name": "result",
                    "type": node.returns.id.lower(),
                    "description": "Résultat de l'exécution"
                })
        
        # Analyse les accès aux arguments
        for subnode in ast.walk(node):
            if (
                isinstance(subnode, ast.Attribute) and
                isinstance(subnode.value, ast.Name) and
                subnode.value.id == 'args'
            ):
                self.info.inputs.append({
                    "name": subnode.attr,
                    "type": "string",  # Type par défaut
                    "description": f"Argument {subnode.attr}",
                    "required": True
                })

class ManifestGenerator(ScriptBase[Path, Dict[str, Any]]):
    """Générateur de manifests pour les scripts"""
    
    def execute(self) -> bool:
        """Génère le manifest pour un script"""
        try:
            script_path = Path(self.args.script_path)
            output_path = Path(self.args.output_path)
            
            # Crée une étape de progression
            step = self.progress.add_step(3, "Génération du manifest")
            
            # Analyse le script
            self.logger.info(f"Analyse du script: {script_path}")
            analyzer = ScriptAnalyzer(script_path)
            info = analyzer.analyze()
            self.progress.update(step)
            
            # Génère le manifest
            manifest = {
                "script_info": {
                    "id": f"{info.category}-{info.name}",
                    "name": info.name,
                    "version": info.version,
                    "description": info.description,
                    "author": info.author,
                    "category": info.category,
                    "tags": info.tags
                },
                "execution": {
                    "python_version": info.python_version,
                    "dependencies": sorted(info.dependencies),
                    "entry_point": script_path.name,
                    "environment_vars": []
                },
                "interface": {
                    "inputs": info.inputs,
                    "outputs": info.outputs
                }
            }
            
            self.progress.update(step)
            
            # Écrit le manifest
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
                
            self.logger.info(f"Manifest généré: {output_path}")
            self.progress.update(step)
            
            # Génère le rapport
            report = {
                "script": str(script_path),
                "manifest": str(output_path),
                "info": {
                    "name": info.name,
                    "version": info.version,
                    "dependencies": len(info.dependencies),
                    "inputs": len(info.inputs),
                    "outputs": len(info.outputs)
                }
            }
            
            self.generate_output(report)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur de génération: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    generator = ManifestGenerator()
    sys.exit(generator.run())

if __name__ == "__main__":
    main()
