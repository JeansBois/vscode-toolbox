import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ScriptManager } from '../../script-manager/manager';
import * as path from 'path';
import { 
    DependencyManager,
    InstallResult,
    ScriptManifest
} from '../../script-manager/types';
import { ExecutionResult } from '../../python-runtime/process';

suite('Script Manager Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let scriptManager: ScriptManager;
    let dependencyManager: DependencyManager;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock ExtensionContext
        const mockContext: vscode.ExtensionContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
                keys: () => []
            },
            extensionPath: '/test/path',
            extensionUri: vscode.Uri.file('/test/path'),
            environmentVariableCollection: {
                persistent: true,
                replace: () => {},
                append: () => {},
                prepend: () => {},
                get: () => undefined,
                forEach: () => {},
                delete: () => {},
                clear: () => {},
                getScoped: () => ({} as any),
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
                onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
            },
            asAbsolutePath: (relativePath: string) => path.join('/test/path', relativePath),
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
            languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation
        };

        scriptManager = new ScriptManager(mockContext) as any;
        // Créer un nouveau DependencyManager pour les tests
        dependencyManager = new DependencyManager(
            scriptManager['_pythonRuntime'],
            path.join(mockContext.globalStoragePath, 'dependencies')
        );
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Validation des Scripts', () => {
        test('Devrait valider un script valide', async () => {
            const mockScript: ScriptManifest = {
                script_info: {
                    id: 'test-script',
                    name: 'test-script',
                    version: '1.0.0',
                    description: 'Script de test',
                    author: 'Test',
                    category: 'test'
                },
                execution: {
                    entry_point: 'script.py',
                    python_version: '3.8',
                    dependencies: ['requests']
                }
            };

            const validationResult = await scriptManager.validateScript('/path/to/script', mockScript);
            assert.strictEqual(validationResult.isValid, true);
        });

        test('Devrait rejeter un script invalide', async () => {
            const mockScript: ScriptManifest = {
                script_info: {
                    id: 'test-script',
                    name: 'test-script',
                    version: '', // version manquante
                    description: 'Script de test',
                    author: 'Test',
                    category: 'test'
                },
                execution: {
                    entry_point: 'script.py',
                    python_version: '3.8',
                    dependencies: ['requests']
                }
            };

            const validationResult = await scriptManager.validateScript('/path/to/script', mockScript);
            assert.strictEqual(validationResult.isValid, false);
            assert.ok(validationResult.errors?.some(e => e.message === 'Version du script manquante'));
        });
    });

    suite('Gestion des Dépendances', () => {
        test('Devrait installer les dépendances requises', async () => {
            const mockResult: InstallResult = {
                success: true,
                installed: ['requests', 'pandas'],
                errors: []
            };

            const installStub = sandbox.stub(dependencyManager, 'installDependencies')
                .resolves(mockResult);

            const dependencies = ['requests', 'pandas'];
            const result = await dependencyManager.installDependencies(dependencies, 'test-script-id');

            assert.strictEqual(result.success, true);
            assert.strictEqual(installStub.calledOnce, true);
            assert.deepStrictEqual(result.installed, dependencies);
            assert.strictEqual(result.errors.length, 0);
        });

        test('Devrait gérer les erreurs d\'installation', async () => {
            const mockResult: InstallResult = {
                success: false,
                installed: [],
                errors: ['Erreur d\'installation']
            };

            sandbox.stub(dependencyManager, 'installDependencies')
                .resolves(mockResult);

            const dependencies = ['package-invalide'];
            const result = await dependencyManager.installDependencies(dependencies, 'invalid-script-id');

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.errors.length, 1);
        });
    });

    suite('Exécution des Scripts', () => {
        test('Devrait exécuter un script avec succès', async () => {
            const mockResult: ExecutionResult = {
                stdout: 'Script exécuté avec succès',
                stderr: '',
                exitCode: 0,
                duration: 100
            };

            const pythonRuntime = scriptManager['_pythonRuntime'];
            const executeStub = sandbox.stub(pythonRuntime, 'executeScript')
                .resolves(mockResult);

            const scriptPath = '/chemin/vers/script.py';
            const result = await pythonRuntime.executeScript(scriptPath);

            assert.strictEqual(result.exitCode, 0);
            assert.ok(result.stdout);
            assert.strictEqual(executeStub.calledOnce, true);
            assert.strictEqual(executeStub.firstCall.args[0], scriptPath);
        });

        test('Devrait gérer les erreurs d\'exécution', async () => {
            const mockResult: ExecutionResult = {
                stdout: '',
                stderr: 'Erreur d\'exécution',
                exitCode: 1,
                duration: 100
            };

            const pythonRuntime = scriptManager['_pythonRuntime'];
            sandbox.stub(pythonRuntime, 'executeScript')
                .resolves(mockResult);

            const scriptPath = '/chemin/vers/script-invalide.py';
            const result = await pythonRuntime.executeScript(scriptPath);

            assert.strictEqual(result.exitCode, 1);
            assert.ok(result.stderr);
        });
    });
});
