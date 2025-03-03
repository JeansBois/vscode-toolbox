import unittest
import os
import sys
from pathlib import Path

# Ajout du répertoire parent au PYTHONPATH
sys.path.append(str(Path(__file__).parent.parent))

from base import ScriptBase
from typing import Dict, Any

class TestScriptBase(unittest.TestCase):
    def setUp(self):
        """Configuration initiale pour chaque test"""
        self.script = ScriptBase()
        self.test_manifest = {
            "name": "test-script",
            "version": "1.0.0",
            "description": "Script de test",
            "author": "Test Author",
            "dependencies": ["requests"],
            "main": "script.py"
        }

    def test_manifest_validation(self):
        """Test de la validation du manifest"""
        # Test avec un manifest valide
        result = self.script.validate_manifest(self.test_manifest)
        self.assertTrue(result.is_valid)
        self.assertEqual(len(result.errors), 0)

        # Test avec un manifest invalide (champ requis manquant)
        invalid_manifest = self.test_manifest.copy()
        del invalid_manifest["version"]
        result = self.script.validate_manifest(invalid_manifest)
        self.assertFalse(result.is_valid)
        self.assertTrue(any("version" in error for error in result.errors))

    def test_dependency_management(self):
        """Test de la gestion des dépendances"""
        # Test d'installation de dépendances
        result = self.script.install_dependencies(["requests"])
        self.assertTrue(result.success)
        self.assertEqual(len(result.installed), 1)
        self.assertEqual(len(result.errors), 0)

        # Test avec une dépendance invalide
        result = self.script.install_dependencies(["package_invalide_12345"])
        self.assertFalse(result.success)
        self.assertEqual(len(result.installed), 0)
        self.assertTrue(len(result.errors) > 0)

    def test_configuration_loading(self):
        """Test du chargement de la configuration"""
        test_config = {
            "api_key": "test-key",
            "endpoint": "https://api.test.com",
            "timeout": 30
        }
        
        # Test de chargement d'une configuration valide
        self.script.load_config(test_config)
        self.assertEqual(self.script.get_config("api_key"), "test-key")
        self.assertEqual(self.script.get_config("timeout"), 30)

        # Test avec une clé inexistante
        with self.assertRaises(KeyError):
            self.script.get_config("invalid_key")

    def test_error_handling(self):
        """Test de la gestion des erreurs"""
        # Test d'une opération invalide
        with self.assertRaises(ValueError):
            self.script.validate_manifest({})

        # Test de gestion des exceptions pendant l'exécution
        def failing_operation():
            raise Exception("Test d'erreur")

        result = self.script.safe_execute(failing_operation)
        self.assertFalse(result.success)
        self.assertTrue("Test d'erreur" in result.error)

    def test_execution_flow(self):
        """Test du flux d'exécution"""
        # Test d'exécution réussie
        def successful_operation():
            return "Succès"

        result = self.script.safe_execute(successful_operation)
        self.assertTrue(result.success)
        self.assertEqual(result.output, "Succès")

        # Test avec paramètres
        def parametrized_operation(x: int, y: int) -> int:
            return x + y

        result = self.script.safe_execute(
            parametrized_operation,
            args=(2, 3)
        )
        self.assertTrue(result.success)
        self.assertEqual(result.output, 5)

if __name__ == '__main__':
    unittest.main()
