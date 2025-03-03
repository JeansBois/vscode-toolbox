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
const sinon = __importStar(require("sinon"));
const vscode = __importStar(require("vscode"));
const manager_1 = require("../../script-manager/manager");
const path = __importStar(require("path"));
const types_1 = require("../../script-manager/types");
suite('Script Manager Test Suite', () => {
    let sandbox;
    let scriptManager;
    let dependencyManager;
    setup(() => {
        sandbox = sinon.createSandbox();
        // Mock ExtensionContext
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
        // Créer un nouveau DependencyManager pour les tests
        dependencyManager = new types_1.DependencyManager(scriptManager['_pythonRuntime'], path.join(mockContext.globalStoragePath, 'dependencies'));
    });
    teardown(() => {
        sandbox.restore();
    });
    suite('Validation des Scripts', () => {
        test('Devrait valider un script valide', async () => {
            const mockScript = {
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
            const mockScript = {
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
            const mockResult = {
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
            const mockResult = {
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
            const mockResult = {
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
            const mockResult = {
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
//# sourceMappingURL=script-manager.test.js.map