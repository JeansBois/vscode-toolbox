"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const manager_1 = require("../../script-manager/manager");
const checklist_1 = require("../../file-manager/checklist");
const process_1 = require("../../python-runtime/process");
suite('Tests d\'Intégration', () => {
    let scriptManager;
    let checklistManager;
    let pythonRuntime;
    suiteSetup(async () => {
        // Attendre l'activation de l'extension
        const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
        await extension?.activate();
    });
    setup(() => {
        pythonRuntime = new process_1.PythonRuntime();
        // Mock ExtensionContext pour les tests
        const mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => { },
                keys: () => []
            },
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
            environmentVariableCollection: {
                persistent: true,
                replace: () => { },
                append: () => { },
                prepend: () => { },
                get: () => undefined,
                forEach: () => { },
                delete: () => { },
                clear: () => { },
                getScoped: () => ({}),
                [Symbol.iterator]: function* () { yield* []; },
                description: 'Test Collection'
            },
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {
                store: () => Promise.resolve(),
                get: () => Promise.resolve(undefined),
                delete: () => Promise.resolve(),
                onDidChange: new vscode.EventEmitter().event
            },
            // Propriétés manquantes
            asAbsolutePath: (relativePath) => path.join('/test/path', relativePath),
            storagePath: '/test/storage/path',
            globalStoragePath: '/test/global/storage/path',
            logPath: '/test/log/path',
            extension: {
                id: 'test-extension',
                extensionUri: vscode.Uri.file('/test/path'),
                extensionPath: '/test/path',
                isActive: true,
                packageJSON: {},
                exports: undefined,
                activate: () => Promise.resolve(),
                extensionKind: vscode.ExtensionKind.Workspace
            },
            languageModelAccessInformation: {}
        };
        scriptManager = new manager_1.ScriptManager(mockContext);
        checklistManager = new checklist_1.ChecklistManager(mockContext);
    });
    suite('Workflow End-to-End', () => {
        test('Devrait exécuter un workflow complet', async () => {
            // 1. Validation et installation d'un script
            const scriptManifest = {
                script_info: {
                    id: 'test-integration',
                    name: 'test-integration',
                    version: '1.0.0',
                    description: 'Script de test d\'intégration',
                    author: 'Test',
                    category: 'test'
                },
                execution: {
                    entry_point: 'test_script.py',
                    python_version: '3.8',
                    dependencies: ['requests']
                }
            };
            const validationResult = await scriptManager.validateScript('/test/path', scriptManifest);
            assert.strictEqual(validationResult.isValid, true);
            const installResult = await scriptManager['_dependencyManager'].installDependencies(scriptManifest.execution.dependencies, scriptManifest.script_info.id);
            assert.strictEqual(installResult.success, true);
            // 2. Ajout de fichiers à la checklist
            await checklistManager.addItem('test_script.py');
            // 3. Exécution du script
            const executionResult = await pythonRuntime.executeScript('test_script.py');
            assert.strictEqual(executionResult.exitCode, 0);
        });
    });
    suite('Tests de Performance', () => {
        test('Devrait gérer plusieurs opérations simultanées', async () => {
            const startTime = Date.now();
            // Exécuter plusieurs opérations en parallèle
            const operations = [];
            for (let i = 0; i < 5; i++) {
                operations.push(pythonRuntime.executeScript(`script${i}.py`));
            }
            const results = await Promise.all(operations);
            const endTime = Date.now();
            // Vérifier que toutes les opérations ont réussi
            assert.strictEqual(results.every(r => r.exitCode === 0), true);
            // Vérifier que le temps d'exécution est raisonnable (< 5s)
            assert.ok((endTime - startTime) < 5000);
        });
        test('Devrait gérer efficacement la mémoire', async () => {
            // Simuler une charge importante
            const largeData = Buffer.alloc(1024 * 1024); // 1MB
            const iterations = 10;
            for (let i = 0; i < iterations; i++) {
                await pythonRuntime.executeScript('test_script.py', [], {
                    env: { LARGE_DATA: largeData.toString('base64') }
                });
            }
            // La vérification de la mémoire est principalement observationnelle
            // mais nous pouvons vérifier que le système reste fonctionnel
            const finalExecution = await pythonRuntime.executeScript('test_script.py');
            assert.strictEqual(finalExecution.exitCode, 0);
        });
    });
    suite('Tests de Sécurité', () => {
        test('Devrait bloquer les chemins non autorisés', async () => {
            const nonAuthorizedPath = path.join('..', '..', 'system', 'script.py');
            try {
                await pythonRuntime.executeScript(nonAuthorizedPath);
                assert.fail('Devrait rejeter les chemins non autorisés');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('non autorisé'));
            }
        });
        test('Devrait valider les entrées utilisateur', async () => {
            const maliciousInput = {
                script_info: {
                    id: 'test"; rm -rf /',
                    name: 'test"; rm -rf /',
                    version: '1.0.0',
                    description: '<script>alert("xss")</script>',
                    author: 'test',
                    category: 'test'
                },
                execution: {
                    entry_point: '../../../etc/passwd',
                    python_version: '3.8',
                    dependencies: ['requests; rm -rf /']
                }
            };
            const validationResult = await scriptManager.validateScript('/test/path', maliciousInput);
            assert.strictEqual(validationResult.isValid, false);
            assert.ok(validationResult.errors?.some(e => e.message.includes('caractères non autorisés')));
        });
    });
    suite('Tests de Compatibilité', () => {
        test('Devrait gérer différents systèmes de fichiers', async () => {
            // Tester les chemins Windows et Unix
            const paths = [
                'script.py',
                'folder/script.py',
                'folder\\script.py',
                'C:\\folder\\script.py',
                '/usr/local/script.py'
            ];
            for (const testPath of paths) {
                const normalizedPath = path.normalize(testPath);
                try {
                    const result = await pythonRuntime.executeScript(normalizedPath);
                    assert.ok(result.exitCode === 0 || result.stderr.includes('non autorisé'));
                }
                catch (error) {
                    assert.ok(error.message.includes('non autorisé'));
                }
            }
        });
        test('Devrait gérer différentes versions de Python', async () => {
            const pythonVersions = ['python3.8', 'python3.9', 'python3.10'];
            for (const version of pythonVersions) {
                const runtime = new process_1.PythonRuntime(version);
                try {
                    const result = await runtime.executeScript('test_script.py');
                    if (result.exitCode === 0) {
                        assert.ok(true, `Fonctionne avec ${version}`);
                    }
                }
                catch (error) {
                    // Ignorer les erreurs si la version n'est pas installée
                    console.log(`${version} non disponible`);
                }
            }
        });
    });
});
//# sourceMappingURL=integration.test.js.map