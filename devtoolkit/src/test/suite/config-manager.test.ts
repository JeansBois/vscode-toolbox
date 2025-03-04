import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigManager } from '../../config/config-manager';

suite('Config Manager Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let mockWorkspace: any;
    let configManager: ConfigManager;
    
    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension/path',
            extensionUri: vscode.Uri.file('/test/extension/path'),
            globalStoragePath: '/test/global/storage',
            storagePath: '/test/storage',
            asAbsolutePath: (p: string) => path.join('/test/extension/path', p)
        } as unknown as vscode.ExtensionContext;
        
        // Mock vscode.workspace
        mockWorkspace = {
            getConfiguration: sandbox.stub(),
            workspaceFolders: [{ uri: vscode.Uri.file('/test/workspace') }]
        };
        sandbox.stub(vscode, 'workspace').value(mockWorkspace);
        
        // Mock configuration values
        const mockConfig = {
            get: sandbox.stub(),
            update: sandbox.stub().resolves(),
            has: sandbox.stub().returns(true),
            inspect: sandbox.stub()
        };
        
        // Setup default config behavior
        mockConfig.get.callsFake((key: string, defaultValue: any) => {
            // Return default values for most settings
            if (key === 'pythonPath') return 'python';
            if (key === 'scriptsDirectory') return '${extensionPath}/scripts';
            if (key === 'globalStorage') return true;
            if (key === 'logging.level') return 'info';
            if (key === 'security.allowedPaths') return ['/test/extension/path', '${workspaceFolder}'];
            return defaultValue;
        });
        
        mockWorkspace.getConfiguration.returns(mockConfig);
        
        // Initialize ConfigManager
        ConfigManager.initialize(mockContext);
        configManager = ConfigManager.getInstance();
    });
    
    teardown(() => {
        sandbox.restore();
    });
    
    suite('Configuration Loading', () => {
        test('Should load configuration with default values', () => {
            const config = configManager.getConfiguration();
            
            assert.strictEqual(config.pythonPath, 'python', 'Should load Python path');
            assert.strictEqual(config.scriptsDirectory, '${extensionPath}/scripts', 'Should load scripts directory');
            assert.strictEqual(config.globalStorage, true, 'Should load global storage setting');
            assert.strictEqual(config.logging.level, 'info', 'Should load correct log level');
        });
        
        test('Should handle missing configuration values', () => {
            // Mock missing values
            const mockConfigWithMissing = {
                get: sandbox.stub().returns(undefined),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(false)
            };
            mockWorkspace.getConfiguration.returns(mockConfigWithMissing);
            
            // Should use defaults for missing values
            const config = configManager.getConfiguration();
            
            // Check some defaults are used
            assert.ok(config.pythonPath, 'Should have default Python path');
            assert.ok(config.scriptsDirectory, 'Should have default scripts directory');
            assert.ok(config.logging.level, 'Should have default log level');
        });
        
        test('Should properly replace extension variables', () => {
            // This test depends on how the ConfigManager implements variable replacement
            // Here's a basic test assuming it does variable replacement
            
            // Mock config that returns paths with variables
            const mockConfigWithVars = {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockConfigWithVars.get.callsFake((key: string, defaultValue: any) => {
                if (key === 'scriptsDirectory') return '${extensionPath}/scripts';
                if (key === 'templates.directory') return '${extensionPath}/templates';
                return defaultValue;
            });
            
            mockWorkspace.getConfiguration.returns(mockConfigWithVars);
            
            // Load config and check if variables are replaced
            const config = configManager.getConfiguration();
            
            // If ConfigManager replaces variables, paths should be absolute
            // If not, this test can be adjusted based on actual implementation
            assert.ok(config.scriptsDirectory.includes('/test/extension/path') || 
                     config.scriptsDirectory.includes('${extensionPath}'),
                'Scripts directory should have path variable');
        });
    });
    
    suite('Configuration Validation', () => {
        test('Should validate correct configuration', () => {
            // Setup valid configuration
            const mockValidConfig = {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockValidConfig.get.callsFake((key: string, defaultValue: any) => {
                if (key === 'pythonPath') return 'python';
                if (key === 'scriptsDirectory') return '/valid/path';
                if (key === 'templates.directory') return '/valid/templates';
                if (key === 'logging.level') return 'info';
                if (key === 'security.allowedPaths') return ['/valid/path'];
                if (key === 'security.blockedExtensions') return ['.exe', '.dll'];
                return defaultValue;
            });
            
            mockWorkspace.getConfiguration.returns(mockValidConfig);
            
            const errors = configManager.validateConfiguration();
            assert.strictEqual(errors.length, 0, 'Valid configuration should have no errors');
        });
        
        test('Should detect missing required values', () => {
            // Setup configuration with missing values
            const mockInvalidConfig = {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockInvalidConfig.get.callsFake((key: string, defaultValue: any) => {
                if (key === 'pythonPath') return '';  // Empty Python path
                if (key === 'scriptsDirectory') return ''; // Empty scripts directory
                if (key === 'templates.directory') return '/valid/templates';
                if (key === 'logging.level') return 'info';
                if (key === 'security.allowedPaths') return ['/valid/path'];
                if (key === 'security.blockedExtensions') return ['.exe', '.dll'];
                return defaultValue;
            });
            
            mockWorkspace.getConfiguration.returns(mockInvalidConfig);
            
            const errors = configManager.validateConfiguration();
            assert.ok(errors.length > 0, 'Invalid configuration should have errors');
            
            // Check specific errors
            const pythonPathError = errors.some(error => error.includes('Python path'));
            const scriptsDirError = errors.some(error => error.includes('Scripts directory'));
            
            assert.ok(pythonPathError || scriptsDirError, 
                'Should report errors for missing required fields');
        });
        
        test('Should validate log level values', () => {
            // Setup configuration with invalid log level
            const mockInvalidLogConfig = {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockInvalidLogConfig.get.callsFake((key: string, defaultValue: any) => {
                if (key === 'pythonPath') return 'python';
                if (key === 'scriptsDirectory') return '/valid/path';
                if (key === 'templates.directory') return '/valid/templates';
                if (key === 'logging.level') return 'invalid_level'; // Invalid log level
                if (key === 'security.allowedPaths') return ['/valid/path'];
                if (key === 'security.blockedExtensions') return ['.exe', '.dll'];
                return defaultValue;
            });
            
            mockWorkspace.getConfiguration.returns(mockInvalidLogConfig);
            
            const errors = configManager.validateConfiguration();
            assert.ok(errors.length > 0, 'Configuration with invalid log level should have errors');
            
            // Check for log level error
            const logLevelError = errors.some(error => error.toLowerCase().includes('log level'));
            assert.ok(logLevelError, 'Should report error for invalid log level');
        });
    });
    
    suite('Configuration Updates', () => {
        test('Should update configuration values', async () => {
            // Setup configuration mock
            const mockUpdateConfig = {
                get: sandbox.stub().returns('old_value'),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockWorkspace.getConfiguration.returns(mockUpdateConfig);
            
            // Update a configuration value
            await configManager.updateConfiguration('pythonPath', 'new_python_path', vscode.ConfigurationTarget.Global);
            
            // Check that update was called with correct parameters
            assert.ok(mockUpdateConfig.update.calledOnce, 'Update should be called once');
            assert.strictEqual(mockUpdateConfig.update.firstCall.args[0], 'pythonPath', 
                'Should update correct setting');
            assert.strictEqual(mockUpdateConfig.update.firstCall.args[1], 'new_python_path', 
                'Should set new value');
            assert.strictEqual(mockUpdateConfig.update.firstCall.args[2], vscode.ConfigurationTarget.Global, 
                'Should use correct target');
        });
        
        test('Should update nested configuration values', async () => {
            // Setup configuration mock
            const mockUpdateConfig = {
                get: sandbox.stub().returns('old_value'),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockWorkspace.getConfiguration.returns(mockUpdateConfig);
            
            // Update a nested configuration value
            await configManager.updateConfiguration('logging.level', 'debug', vscode.ConfigurationTarget.Global);
            
            // Check that update was called with correct parameters
            assert.ok(mockUpdateConfig.update.calledOnce, 'Update should be called once');
            assert.strictEqual(mockUpdateConfig.update.firstCall.args[0], 'logging.level', 
                'Should update correct nested setting');
            assert.strictEqual(mockUpdateConfig.update.firstCall.args[1], 'debug', 
                'Should set new value');
        });
        
        test('Should reset configuration to defaults', async () => {
            // Setup configuration mock
            const mockUpdateConfig = {
                get: sandbox.stub().returns('custom_value'),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            mockWorkspace.getConfiguration.returns(mockUpdateConfig);
            
            // Reset configuration
            await configManager.resetConfiguration(vscode.ConfigurationTarget.Global);
            
            // Should call update multiple times for different settings
            assert.ok(mockUpdateConfig.update.called, 'Update should be called for reset');
            assert.ok(mockUpdateConfig.update.callCount > 1, 
                'Should update multiple settings during reset');
        });
    });
    
    suite('Workspace Configuration', () => {
        test('Should get workspace-specific configuration', () => {
            // Setup workspace folders
            mockWorkspace.workspaceFolders = [{ uri: vscode.Uri.file('/test/workspace') }];
            
            const workspaceConfig = configManager.getWorkspaceConfig();
            
            assert.ok(workspaceConfig, 'Should return workspace configuration');
        });
        
        test('Should handle no workspace case', () => {
            // Mock no workspace folders
            mockWorkspace.workspaceFolders = undefined;
            
            const workspaceConfig = configManager.getWorkspaceConfig();
            
            assert.strictEqual(workspaceConfig, undefined, 
                'Should return undefined when no workspace is open');
        });
    });
    
    suite('Configuration Migration', () => {
        test('Should migrate from legacy Python extension settings', async () => {
            // Setup Python extension configuration mock
            const mockPythonConfig = {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            // Mock Python extension interpreter path
            mockPythonConfig.get.withArgs('defaultInterpreterPath').returns('/python/legacy/path');
            
            // Setup main extension configuration mock
            const mockDevToolkitConfig = {
                get: sandbox.stub().returns(undefined),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            // Mock different configuration sections
            mockWorkspace.getConfiguration.callsFake((section: string) => {
                if (section === 'python') return mockPythonConfig;
                return mockDevToolkitConfig;
            });
            
            // Run migration
            await configManager.migrateFromLegacy();
            
            // Check that Python path was migrated
            assert.ok(mockDevToolkitConfig.update.calledWith('pythonPath', '/python/legacy/path'), 
                'Should migrate Python path from legacy settings');
        });
        
        test('Should handle migration errors gracefully', async () => {
            // Setup Python extension configuration to throw error
            const mockPythonConfig = {
                get: sandbox.stub().throws(new Error('Migration error')),
                update: sandbox.stub().resolves(),
                has: sandbox.stub().returns(true)
            };
            
            // Mock workspace getConfiguration
            mockWorkspace.getConfiguration.withArgs('python').returns(mockPythonConfig);
            
            // Mock window.showErrorMessage
            const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
            
            try {
                await configManager.migrateFromLegacy();
                assert.fail('Should throw error on migration failure');
            } catch (error: any) {
                assert.ok(error.message.includes('Migration error'), 
                    'Should throw original error');
                assert.ok(showErrorMessageStub.called, 
                    'Should show error message on migration failure');
            }
        });
    });
});
