#!/usr/bin/env python3
"""
Data Processor Template
---------------------
Template spécialisé pour le traitement de données avec:
- Traitement par lots (chunking)
- Support de streaming
- Validation de données
- Transformations en chaîne
- Gestion de la mémoire
"""

import csv
import json
from abc import abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import (
    Any, Dict, Generator, Generic, Iterator, List, 
    Optional, TypeVar, Union
)
import sys

from ..script_template import (
    AsyncScriptBase, ScriptBase, ScriptError,
    ScriptErrorLevel, ScriptHooks
)

# Types génériques pour les données
DataT = TypeVar('DataT')
ResultT = TypeVar('ResultT')

@dataclass
class DataChunk(Generic[DataT]):
    """Représente un lot de données à traiter"""
    data: List[DataT]
    index: int
    total_chunks: int
    metadata: Optional[Dict[str, Any]] = None

class DataTransformer(Generic[DataT, ResultT]):
    """Interface pour les transformations de données"""
    
    @abstractmethod
    def transform(self, data: DataT) -> ResultT:
        """Transforme une unité de données"""
        raise NotImplementedError()
    
    def bulk_transform(self, chunk: DataChunk[DataT]) -> DataChunk[ResultT]:
        """Transforme un lot de données"""
        return DataChunk(
            data=[self.transform(item) for item in chunk.data],
            index=chunk.index,
            total_chunks=chunk.total_chunks,
            metadata=chunk.metadata
        )

class DataProcessor(ScriptBase[DataT, ResultT], ScriptHooks):
    """Base pour les scripts de traitement de données"""
    
    def __init__(self, chunk_size: int = 1000):
        super().__init__()
        self.chunk_size = chunk_size
        self.transformers: List[DataTransformer] = []
        
    def pre_validate(self) -> bool:
        """Vérifie la configuration avant traitement"""
        self.logger.info("Validation de la configuration...")
        return True
        
    def post_validate(self, success: bool) -> None:
        """Post-validation des données"""
        status = "succès" if success else "échec"
        self.logger.info(f"Validation terminée: {status}")
        
    def pre_execute(self) -> bool:
        """Préparation du traitement"""
        self.logger.info("Préparation du traitement...")
        return True
        
    def post_execute(self, success: bool) -> None:
        """Nettoyage post-traitement"""
        status = "succès" if success else "échec"
        self.logger.info(f"Traitement terminé: {status}")
    
    def add_transformer(self, transformer: DataTransformer) -> None:
        """Ajoute une transformation à la chaîne"""
        self.transformers.append(transformer)
    
    def read_csv(self, path: Path) -> Generator[DataChunk[Dict[str, Any]], None, None]:
        """Lit un fichier CSV par lots"""
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            chunk: List[Dict[str, Any]] = []
            chunk_index = 0
            
            for row in reader:
                chunk.append(row)
                if len(chunk) >= self.chunk_size:
                    yield DataChunk(chunk, chunk_index, -1)
                    chunk = []
                    chunk_index += 1
                    
            if chunk:
                yield DataChunk(chunk, chunk_index, -1)
    
    def read_json(self, path: Path) -> Generator[DataChunk[Dict[str, Any]], None, None]:
        """Lit un fichier JSON par lots"""
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                total_chunks = (len(data) + self.chunk_size - 1) // self.chunk_size
                for i in range(0, len(data), self.chunk_size):
                    chunk = data[i:i + self.chunk_size]
                    yield DataChunk(chunk, i // self.chunk_size, total_chunks)
            else:
                yield DataChunk([data], 0, 1)
    
    def process_chunk(self, chunk: DataChunk[Any]) -> DataChunk[Any]:
        """Applique toutes les transformations à un lot"""
        result = chunk
        for transformer in self.transformers:
            result = transformer.bulk_transform(result)
        return result
    
    def write_results(self, results: Iterator[DataChunk[ResultT]], output_path: Path) -> None:
        """Écrit les résultats dans un fichier"""
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                # Détermine le format de sortie
                if output_path.suffix == '.csv':
                    writer = None
                    for chunk in results:
                        if not writer and chunk.data:
                            # Initialise le writer avec les en-têtes du premier élément
                            headers = chunk.data[0].keys()
                            writer = csv.DictWriter(f, fieldnames=headers)
                            writer.writeheader()
                        writer.writerows(chunk.data)
                else:
                    # Par défaut, écrit en JSON
                    all_data = []
                    for chunk in results:
                        all_data.extend(chunk.data)
                    json.dump(all_data, f, indent=2, ensure_ascii=False)
                    
        except Exception as e:
            raise ScriptError(
                f"Erreur d'écriture des résultats: {str(e)}",
                ScriptErrorLevel.ERROR
            )
    
    def execute(self) -> bool:
        """Exécute le traitement des données"""
        try:
            input_path = Path(self.args.input_file)
            output_path = Path(self.args.output_file)
            
            # Détermine le reader basé sur l'extension
            if input_path.suffix == '.csv':
                reader = self.read_csv
            else:
                reader = self.read_json
            
            # Crée une étape de progression
            step = self.progress.add_step(100, "Traitement des données")
            
            # Traite les données par lots
            chunks = reader(input_path)
            processed_chunks = []
            
            for chunk in chunks:
                # Traite le lot
                processed = self.process_chunk(chunk)
                processed_chunks.append(processed)
                
                # Met à jour la progression
                if chunk.total_chunks > 0:
                    progress = (chunk.index + 1) / chunk.total_chunks * 100
                    self.progress.update(step, int(progress))
            
            # Écrit les résultats
            self.write_results(iter(processed_chunks), output_path)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur de traitement: {str(e)}")
            return False

class AsyncDataProcessor(AsyncScriptBase[DataT, ResultT], DataProcessor[DataT, ResultT]):
    """Version asynchrone du processeur de données"""
    
    async def execute_async(self) -> bool:
        """Implémentation asynchrone du traitement"""
        return self.execute()  # Pour l'exemple, utilise la version synchrone

def main():
    """Point d'entrée du script"""
    processor = DataProcessor[Dict[str, Any], Dict[str, Any]]()
    sys.exit(processor.run())

if __name__ == "__main__":
    main()
