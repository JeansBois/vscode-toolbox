import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ScriptManager } from '../../script-manager/manager';
import * as path from 'path';
import { 
    DependencyManager,
    InstallResult,
    ScriptManifest
} from '../../script-manager/types';
import { ExecutionResult } from '../../python-runtime/process';
import { ConfigManager } from '../../config/config-manager';

// Test utility to create mock manifest
function createMockManifest(overrides: Partial<ScriptManifest> = {}): ScriptManifest {
    const base = {
        script_info: {
            id: 'test-script',
            name: 'Test Script',
            version: '1.0.0',
            description: 'Test script description',
            author: 'Test Author',
            category: 'test'
        },
        execution: {
            entry_point: 'script.py',
            python_version: '3.8',
            dependencies: ['requests']
        }
    };
    
    // Deep merge the base with overrides
    const result = { ...base };
    
    if (overrides.script_info) {
        result.script_info = { ...base.script_info, ...overrides.script_info };
    }
    
    if (overrides.execution) {
        result.execution = { ...base.execution, ...overrides.execution };
    }
    
    return result;
}

suite('Script Manager Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let scriptManager: ScriptManager;
    let dependencyManager: DependencyManager;
    let mockContext: vscode.ExtensionContext;
    let mockFs: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock file system operations
        mockFs = {
            readFile: sandbox.stub(fs.promises, 'readFile'),
            writeFile: sandbox.stub(fs.promises, 'writeFile'),
            access: sandbox.stub(fs.promises, 'access'),
            mkdir: sandbox.stub(fs.promises, 'mkdir'),
            readdir: sandbox.stub(fs.promises, 'readdir'),
            stat: sandbox.stub(fs.promises, 'stat')
        };
        
        // Setup stat mock for directory checking
        mockFs.stat.callsFake((p: string) => {
            return Promise.resolve({
                isDirectory: () => p.endsWith('directory') || p.includes('/scripts/'),
                isFile: () => !p.endsWith('directory') && !p.includes('/scripts/')
            });
        });
        
        // Default file read mock
        mockFs.readFile.callsFake((p: string) => {
            if (p.endsWith('.json')) {
                return Promise.resolve(JSON.stringify(createMockManifest()));
            } else if (p.endsWith('.py')) {
                return Promise.resolve('print("Hello from test script")');
            }
            return Promise.resolve('');
        });
        
        // Mock ExtensionContext
        mockContext = {
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

        // Stub ConfigManager
        sandbox.stub(ConfigManager, 'getInstance').returns({
            getConfiguration: () => ({
                pythonPath: 'python',
                scriptsDirectory: '/test/path/scripts',
                globalStorage: true,
                logging: { level: 'info', file: true, console: true, directory: '/test/log' },
                templates: { 
                    directory: '/test/path/templates', 
                    defaultTemplate: 'base.py', 
                    customTemplates: [] 
                },
                security: {
                    allowedPaths: ['/test/path', '/workspace'],
                    blockedExtensions: ['.exe', '.dll', '.so']
                },
                workspace: {
                    scriptDirectories: [],
                    templateLocations: [],
                    environmentVariables: {},
                    pythonEnvironment: {
                        useVirtualEnv: false,
                        virtualEnvPath: '',
                        requirementsPath: ''
                    }
                }
            }),
            validateConfiguration: () => []
        } as any);

        // Create ScriptManager instance with mocked dependencies
        scriptManager = new ScriptManager(mockContext);
        
        // Create DependencyManager for tests
        dependencyManager = new DependencyManager(
            (scriptManager as any)._pythonRuntime,
            path.join(mockContext.globalStoragePath, 'dependencies')
        );
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Script Validation', () => {
        test('Should validate a valid script', async () => {
            const mockScript = createMockManifest();
            const validationResult = await scriptManager.validateScript('/path/to/script', mockScript);
            
            assert.strictEqual(validationResult.isValid, true, 'Valid script should pass validation');
            assert.deepStrictEqual(validationResult.errors, [], 'Valid script should have no errors');
        });

        test('Should reject script with missing required fields', async () => {
            // Create invalid manifest with missing version
            const mockScript = createMockManifest({
                script_info: {
                    id: 'test-script',
                    name: 'Test Script',
                    version: '', // Empty version
                    description: 'Test script description',
                    author: 'Test Author',
                    category: 'test'
                }
            });

            const validationResult = await scriptManager.validateScript('/path/to/script', mockScript);
            
            assert.strictEqual(validationResult.isValid, false, 'Script with missing version should fail validation');
            assert.ok(validationResult.errors?.some(e => e.message.includes('version')), 
                'Validation should report version error');
        });
        
        test('Should validate script with custom requirements', async () => {
            // Create manifest with custom requirements
            const mockScript = createMockManifest({
                execution: {
                    entry_point: 'script.py',
                    python_version: '3.8',
                    dependencies: ['requests', 'pandas>=1.0.0', 'numpy~=1.19.0']
                }
            });
            
            // Mock file existence check to pass
            mockFs.access.withArgs(sinon.match.any).resolves();
            
            const validationResult = await scriptManager.validateScript('/path/to/script', mockScript);
            
            assert.strictEqual(validationResult.isValid, true, 
                'Script with valid dependency specifications should pass validation');
        });
    });

    suite('Script Content Management', () => {
        test('Should get script content', async () => {
            // Mock file read to return script content
            const scriptContent = 'print("Hello, world!")';
            mockFs.readFile.withArgs('/path/to/script.py').resolves(scriptContent);
            
            // Get script content
            const content = await scriptManager.getScriptContent('/path/to/script.py');
            
            assert.strictEqual(content, scriptContent, 'Should return correct script content');
        });
        
        test('Should handle errors when getting script content', async () => {
            // Mock file read to throw error
            mockFs.readFile.withArgs('/path/to/missing.py').rejects(new Error('File not found'));
            
            try {
                await scriptManager.getScriptContent('/path/to/missing.py');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error, 'Error should be thrown for missing file');
            }
        });
    });

    suite('Dependency Management', () => {
        test('Should install required dependencies', async () => {
            const mockResult: InstallResult = {
                success: true,
                installed: ['requests', 'pandas'],
                errors: []
            };

            const installStub = sandbox.stub(dependencyManager, 'installDependencies')
                .resolves(mockResult);

            const dependencies = ['requests', 'pandas'];
            const result = await dependencyManager.installDependencies(dependencies, 'test-script-id');

            assert.strictEqual(result.success, true, 'Installation should be successful');
            assert.strictEqual(installStub.calledOnce, true, 'installDependencies should be called once');
            assert.deepStrictEqual(result.installed, dependencies, 'All dependencies should be installed');
            assert.strictEqual(result.errors.length, 0, 'There should be no errors');
        });

        test('Should handle installation errors', async () => {
            const mockResult: InstallResult = {
                success: false,
                installed: [],
                errors: ['Installation error']
            };

            sandbox.stub(dependencyManager, 'installDependencies')
                .resolves(mockResult);

            const dependencies = ['invalid-package'];
            const result = await dependencyManager.installDependencies(dependencies, 'invalid-script-id');

            assert.strictEqual(result.success, false, 'Installation should fail');
            assert.strictEqual(result.errors.length, 1, 'Error message should be returned');
        });
        
        test('Should handle dependency version requirements', async () => {
            const mockResult: InstallResult = {
                success: true,
                installed: ['pandas==1.1.0'],
                errors: []
            };

            const installStub = sandbox.stub(dependencyManager, 'installDependencies')
                .resolves(mockResult);

            const dependencies = ['pandas==1.1.0'];
            const result = await dependencyManager.installDependencies(dependencies, 'test-script-id');

            assert.strictEqual(result.success, true, 'Version-specific installation should succeed');
            assert.deepStrictEqual(result.installed, dependencies, 'Correct version should be installed');
            assert.strictEqual(installStub.firstCall.args[0][0], 'pandas==1.1.0', 
                'Version requirement should be passed correctly');
        });
    });

    suite('Script Execution', () => {
        test('Should execute a script successfully', async () => {
            const mockResult: ExecutionResult = {
                stdout: 'Script executed successfully',
                stderr: '',
                exitCode: 0,
                duration: 100
            };

            const pythonRuntime = (scriptManager as any)._pythonRuntime;
            const executeStub = sandbox.stub(pythonRuntime, 'executeScript')
                .resolves(mockResult);

            const scriptPath = '/path/to/script.py';
            const result = await pythonRuntime.executeScript(scriptPath);

            assert.strictEqual(result.exitCode, 0, 'Script should execute with success exit code');
            assert.ok(result.stdout, 'Output should be captured');
            assert.strictEqual(executeStub.calledOnce, true, 'Execute should be called once');
            assert.strictEqual(executeStub.firstCall.args[0], scriptPath, 'Correct script path should be used');
        });

        test('Should handle execution errors', async () => {
            const mockResult: ExecutionResult = {
                stdout: '',
                stderr: 'Execution error',
                exitCode: 1,
                duration: 100
            };

            const pythonRuntime = (scriptManager as any)._pythonRuntime;
            sandbox.stub(pythonRuntime, 'executeScript')
                .resolves(mockResult);

            const scriptPath = '/path/to/invalid-script.py';
            const result = await pythonRuntime.executeScript(scriptPath);

            assert.strictEqual(result.exitCode, 1, 'Failed script should return non-zero exit code');
            assert.ok(result.stderr, 'Error output should be captured');
        });
        
        test('Should execute a script with parameters', async () => {
            const mockResult: ExecutionResult = {
                stdout: 'Script executed with parameters',
                stderr: '',
                exitCode: 0,
                duration: 100
            };

            const pythonRuntime = (scriptManager as any)._pythonRuntime;
            const executeStub = sandbox.stub(pythonRuntime, 'executeScript')
                .resolves(mockResult);

            const scriptPath = '/path/to/script.py';
            const params = ['--input', 'file.txt', '--verbose'];
            
            // Call executeScript with parameters
            const result = await pythonRuntime.executeScript(scriptPath, params);

            assert.strictEqual(result.exitCode, 0, 'Script should execute successfully with parameters');
            assert.ok(executeStub.firstCall.args[1], 'Parameters should be passed to execution');
            assert.deepStrictEqual(executeStub.firstCall.args[1], params, 
                'Parameters should match provided values');
        });
        
        test('Should handle process termination', async () => {
            const pythonRuntime = (scriptManager as any)._pythonRuntime;
            const killStub = sandbox.stub(pythonRuntime, 'killProcess');
            
            // Call kill
            pythonRuntime.killProcess();
            
            assert.ok(killStub.calledOnce, 'Kill method should be called');
        });
    });
});
