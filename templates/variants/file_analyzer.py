#!/usr/bin/env python3
"""
File Analyzer Template
--------------------
Template spécialisé pour l'analyse de fichiers avec:
- Support multi-formats
- Analyse de contenu
- Extraction de métadonnées
- Génération de rapports
- Statistiques avancées
"""

import hashlib
import magic
import mimetypes
import os
import re
from abc import abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
import sys

from ..script_template import ScriptBase, ScriptError, ScriptErrorLevel, ScriptHooks

@dataclass
class FileMetadata:
    """Structure pour les métadonnées de fichier"""
    path: Path
    size: int
    created: datetime
    modified: datetime
    mime_type: str
    encoding: Optional[str]
    hash_md5: str
    hash_sha256: str
    
    @classmethod
    def from_path(cls, path: Path) -> 'FileMetadata':
        """Crée les métadonnées à partir d'un chemin"""
        stats = path.stat()
        
        # Détection du type MIME et encodage
        mime = magic.Magic(mime=True)
        mime_type = mime.from_file(str(path))
        
        # Détection de l'encodage pour les fichiers texte
        encoding = None
        if mime_type.startswith('text/'):
            magic_encoding = magic.Magic(mime_encoding=True)
            encoding = magic_encoding.from_file(str(path))
        
        # Calcul des hashes
        md5 = hashlib.md5()
        sha256 = hashlib.sha256()
        with open(path, 'rb') as f:
            while chunk := f.read(8192):
                md5.update(chunk)
                sha256.update(chunk)
        
        return cls(
            path=path,
            size=stats.st_size,
            created=datetime.fromtimestamp(stats.st_ctime),
            modified=datetime.fromtimestamp(stats.st_mtime),
            mime_type=mime_type,
            encoding=encoding,
            hash_md5=md5.hexdigest(),
            hash_sha256=sha256.hexdigest()
        )

@dataclass
class AnalysisResult:
    """Structure pour les résultats d'analyse"""
    metadata: FileMetadata
    content_stats: Dict[str, Any]
    patterns_found: Dict[str, List[str]]
    issues: List[str]
    score: float
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le résultat en dictionnaire"""
        return {
            "metadata": {
                "path": str(self.metadata.path),
                "size": self.metadata.size,
                "created": self.metadata.created.isoformat(),
                "modified": self.metadata.modified.isoformat(),
                "mime_type": self.metadata.mime_type,
                "encoding": self.metadata.encoding,
                "hash_md5": self.metadata.hash_md5,
                "hash_sha256": self.metadata.hash_sha256
            },
            "content_stats": self.content_stats,
            "patterns_found": self.patterns_found,
            "issues": self.issues,
            "score": self.score
        }

class ContentAnalyzer:
    """Interface pour les analyseurs de contenu spécifiques"""
    
    @abstractmethod
    def analyze(self, content: bytes, metadata: FileMetadata) -> Dict[str, Any]:
        """Analyse le contenu et retourne les statistiques"""
        raise NotImplementedError()

class TextAnalyzer(ContentAnalyzer):
    """Analyseur pour les fichiers texte"""
    
    def analyze(self, content: bytes, metadata: FileMetadata) -> Dict[str, Any]:
        """Analyse un fichier texte"""
        try:
            text = content.decode(metadata.encoding or 'utf-8')
            lines = text.splitlines()
            words = re.findall(r'\b\w+\b', text.lower())
            
            return {
                "line_count": len(lines),
                "word_count": len(words),
                "char_count": len(text),
                "avg_line_length": sum(len(line) for line in lines) / len(lines) if lines else 0,
                "avg_word_length": sum(len(word) for word in words) / len(words) if words else 0,
                "empty_lines": sum(1 for line in lines if not line.strip()),
                "unique_words": len(set(words))
            }
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse texte: {str(e)}",
                ScriptErrorLevel.ERROR
            )

class BinaryAnalyzer(ContentAnalyzer):
    """Analyseur pour les fichiers binaires"""
    
    def analyze(self, content: bytes, metadata: FileMetadata) -> Dict[str, Any]:
        """Analyse un fichier binaire"""
        try:
            # Analyse basique de la distribution des octets
            byte_counts = [0] * 256
            for byte in content:
                byte_counts[byte] += 1
                
            # Calcul de statistiques
            total_bytes = len(content)
            non_zero_bytes = sum(1 for count in byte_counts if count > 0)
            
            return {
                "file_size": total_bytes,
                "unique_bytes": non_zero_bytes,
                "entropy": sum(
                    -(count/total_bytes) * (count/total_bytes).bit_length()
                    for count in byte_counts if count > 0
                ),
                "null_byte_ratio": byte_counts[0] / total_bytes if total_bytes > 0 else 0
            }
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse binaire: {str(e)}",
                ScriptErrorLevel.ERROR
            )

class FileAnalyzer(ScriptBase[Path, AnalysisResult], ScriptHooks):
    """Base pour les scripts d'analyse de fichiers"""
    
    def __init__(self):
        super().__init__()
        self.analyzers: Dict[str, ContentAnalyzer] = {
            'text': TextAnalyzer(),
            'binary': BinaryAnalyzer()
        }
        self.patterns: Dict[str, str] = {}
        
    def pre_validate(self) -> bool:
        """Vérifie la configuration avant analyse"""
        self.logger.info("Validation de la configuration...")
        return True
        
    def post_validate(self, success: bool) -> None:
        """Post-validation"""
        status = "succès" if success else "échec"
        self.logger.info(f"Validation terminée: {status}")
        
    def pre_execute(self) -> bool:
        """Préparation de l'analyse"""
        self.logger.info("Préparation de l'analyse...")
        return True
        
    def post_execute(self, success: bool) -> None:
        """Nettoyage post-analyse"""
        status = "succès" if success else "échec"
        self.logger.info(f"Analyse terminée: {status}")
    
    def add_pattern(self, name: str, pattern: str) -> None:
        """Ajoute un pattern à rechercher"""
        self.patterns[name] = pattern
    
    def analyze_file(self, path: Path) -> AnalysisResult:
        """Analyse un fichier unique"""
        try:
            # Extraction des métadonnées
            metadata = FileMetadata.from_path(path)
            
            # Lecture du contenu
            with open(path, 'rb') as f:
                content = f.read()
            
            # Sélection de l'analyseur approprié
            if metadata.mime_type.startswith('text/'):
                analyzer = self.analyzers['text']
            else:
                analyzer = self.analyzers['binary']
            
            # Analyse du contenu
            content_stats = analyzer.analyze(content, metadata)
            
            # Recherche des patterns
            patterns_found = {}
            if metadata.mime_type.startswith('text/'):
                text = content.decode(metadata.encoding or 'utf-8')
                for name, pattern in self.patterns.items():
                    matches = re.findall(pattern, text)
                    if matches:
                        patterns_found[name] = matches
            
            # Détection des problèmes potentiels
            issues = []
            if metadata.size == 0:
                issues.append("Fichier vide")
            if metadata.mime_type.startswith('text/') and content_stats['empty_lines'] > content_stats['line_count'] * 0.5:
                issues.append("Proportion élevée de lignes vides")
            
            # Calcul d'un score basique
            score = 1.0
            if issues:
                score *= 0.8
            
            return AnalysisResult(
                metadata=metadata,
                content_stats=content_stats,
                patterns_found=patterns_found,
                issues=issues,
                score=score
            )
            
        except Exception as e:
            raise ScriptError(
                f"Erreur d'analyse du fichier {path}: {str(e)}",
                ScriptErrorLevel.ERROR
            )
    
    def execute(self) -> bool:
        """Exécute l'analyse des fichiers"""
        try:
            input_path = Path(self.args.input_path)
            
            # Détermine les fichiers à analyser
            files_to_analyze: List[Path] = []
            if input_path.is_file():
                files_to_analyze.append(input_path)
            elif input_path.is_dir():
                files_to_analyze.extend(
                    path for path in input_path.rglob('*')
                    if path.is_file()
                )
            
            if not files_to_analyze:
                raise ScriptError(
                    "Aucun fichier à analyser",
                    ScriptErrorLevel.ERROR
                )
            
            # Crée une étape de progression
            step = self.progress.add_step(
                len(files_to_analyze),
                "Analyse des fichiers"
            )
            
            # Analyse chaque fichier
            results = []
            for file_path in files_to_analyze:
                try:
                    result = self.analyze_file(file_path)
                    results.append(result.to_dict())
                except Exception as e:
                    self.logger.warning(f"Échec analyse {file_path}: {str(e)}")
                finally:
                    self.progress.update(step)
            
            # Génère le rapport
            report = {
                "timestamp": datetime.now().isoformat(),
                "total_files": len(files_to_analyze),
                "successful_analyses": len(results),
                "results": results
            }
            
            # Génération sortie
            self.generate_output(report)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur d'analyse: {str(e)}")
            return False

def main():
    """Point d'entrée du script"""
    analyzer = FileAnalyzer()
    sys.exit(analyzer.run())

if __name__ == "__main__":
    main()
