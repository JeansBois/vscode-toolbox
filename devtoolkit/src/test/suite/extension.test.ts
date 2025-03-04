import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { MainPanel } from '../../webview/panel';

suite('Extension Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockExtensionContext: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Create a mock extension context for testing
        mockExtensionContext = {
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
            environmentVariableCollection: {} as any,
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            asAbsolutePath: (p: string) => `/test/path/${p}`,
            storagePath: '/test/storage/path',
            globalStoragePath: '/test/global/storage/path',
            logPath: '/test/log/path',
            extension: {
                id: 'devtoolkit.devtoolkit',
                extensionUri: vscode.Uri.file('/test/path'),
                extensionPath: '/test/path',
                isActive: true,
                packageJSON: {},
                exports: undefined,
                activate: () => Promise.resolve(),
                extensionKind: vscode.ExtensionKind.Workspace
            }
        } as unknown as vscode.ExtensionContext;
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
        assert.ok(extension, 'Extension should be available');
        
        await extension?.activate();
        assert.strictEqual(extension?.isActive, true, 'Extension should be active after activation');
    });

    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const devToolkitCommands = commands.filter(cmd => cmd.startsWith('devtoolkit.'));
        
        // Check all commands from package.json
        const expectedCommands = [
            'devtoolkit.openPanel',
            'devtoolkit.runScript',
            'devtoolkit.addToChecklist',
            'devtoolkit.testMessageValidation'
        ];
        
        for (const cmd of expectedCommands) {
            assert.ok(
                devToolkitCommands.includes(cmd),
                `Command ${cmd} should be registered`
            );
        }
    });
    
    test('View providers should be registered', async () => {
        // Mock window.createTreeView to verify it's called with correct parameters
        const createTreeViewStub = sandbox.stub(vscode.window, 'createTreeView').returns({
            dispose: () => {},
            onDidChangeVisibility: () => { return { dispose: () => {} }; },
            onDidChangeSelection: () => { return { dispose: () => {} }; },
            onDidCollapseElement: () => { return { dispose: () => {} }; },
            onDidExpandElement: () => { return { dispose: () => {} }; },
            reveal: () => Promise.resolve(),
            message: '',
            title: '',
            description: '',
            badge: undefined,
            visible: true,
            selection: []
        } as unknown as vscode.TreeView<any>);
        
        // Activate the extension (we rely on the real extension activation code)
        const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
        await extension?.activate();
        
        // Check that createTreeView was called for our view providers
        assert.ok(
            createTreeViewStub.calledWith('devtoolkit-scripts', sinon.match.object),
            'Scripts view provider should be registered'
        );
        assert.ok(
            createTreeViewStub.calledWith('devtoolkit-checklist', sinon.match.object),
            'Checklist view provider should be registered'
        );
    });

    test('WebView panel creation', async () => {
        // Use mockExtensionContext to avoid unused variable warning
        assert.ok(mockExtensionContext, 'Extension context should be defined');
        
        // Mock the createWebviewPanel method
        const createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel').returns({
            webview: {
                html: '',
                onDidReceiveMessage: () => { return { dispose: () => {} }; },
                postMessage: () => Promise.resolve(true),
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: '',
                options: {}
            },
            onDidChangeViewState: () => { return { dispose: () => {} }; },
            onDidDispose: () => { return { dispose: () => {} }; },
            reveal: () => {},
            dispose: () => {},
            visible: true,
            active: true,
            title: '',
            iconPath: undefined,
            viewColumn: vscode.ViewColumn.One
        } as unknown as vscode.WebviewPanel);
        
        // Mock the MainPanel's static field
        sandbox.stub(MainPanel, 'currentPanel').value(undefined);
        
        // Call the command that creates the panel
        await vscode.commands.executeCommand('devtoolkit.openPanel');
        
        // Verify that createWebviewPanel was called
        assert.ok(
            createWebviewPanelStub.called,
            'WebView panel should be created when openPanel command is executed'
        );
    });

    test('Error handling during activation', async () => {
        // Mock vscode.window.showErrorMessage to spy on error messages
        const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
        
        // Simulate an error during component initialization
        const errorMessage = 'Test activation error';
        sandbox.stub(vscode.extensions, 'getExtension').throws(new Error(errorMessage));
        
        try {
            // Try to activate the extension, which should now fail
            const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
            await extension?.activate();
        } catch (err) {
            // Expected to throw
        }
        
        // Check that the error message was shown
        assert.ok(
            showErrorMessageStub.called,
            'Error message should be shown when activation fails'
        );
    });
});
