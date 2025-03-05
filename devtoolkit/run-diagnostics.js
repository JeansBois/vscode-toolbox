#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Mock minimal vscode API for testing
const mockVscode = {
    window: {
        showInformationMessage: console.log,
        showErrorMessage: console.error,
        createOutputChannel: (name) => ({
            appendLine: console.log,
            append: process.stdout.write.bind(process.stdout),
            clear: () => console.log('\n--- Clearing output ---\n'),
            show: () => console.log('\n--- Output Channel Visible ---\n'),
            dispose: () => {}
        }),
        withProgress: (options, task) => task({
            report: (message) => console.log(`Progress: ${JSON.stringify(message)}`)
        }, { isCancellationRequested: false })
    },
    commands: {
        executeCommand: async (cmd, ...args) => {
            console.log(`Executing command: ${cmd}`);
            if (cmd === 'devtoolkit.runDiagnostics') {
                // We'll call our diagnostics function directly
                await runDiagnostics();
                return true;
            }
            return null;
        }
    },
    workspace: {
        fs: {
            stat: async (uri) => {
                try {
                    const stats = await fs.promises.stat(uri.fsPath);
                    return {
                        type: stats.isDirectory() ? 1 : 0
                    };
                } catch (error) {
                    throw new Error(`File not found: ${uri.fsPath}`);
                }
            }
        }
    },
    Uri: {
        file: (path) => ({ fsPath: path, toString: () => path }),
        joinPath: (uri, ...pathSegments) => ({ fsPath: path.join(uri.fsPath, ...pathSegments) })
    },
    EventEmitter: class EventEmitter {
        constructor() {
            this.listeners = [];
        }
        event = (listener) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
        fire = (data) => this.listeners.forEach(listener => listener(data));
    },
    Disposable: class Disposable {
        constructor(func) {
            this.dispose = func || (() => {});
        }
        static from(...disposables) {
            return new this(() => {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
            });
        }
    },
    FileType: {
        File: 0,
        Directory: 1
    },
    ViewColumn: {
        One: 1
    }
};

// Mock the extension context
const mockContext = {
    extensionPath: path.resolve(__dirname),
    extensionUri: mockVscode.Uri.file(path.resolve(__dirname)),
    subscriptions: [],
    globalStorageUri: mockVscode.Uri.file(path.join(__dirname, 'storage'))
};

// Mock module cache
global.require = function mockRequire(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return require(id);
};

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    process.exit(1);
});

// Now run the diagnostics
async function runDiagnostics() {
    console.log('Running DevToolkit diagnostics...');
    try {
        // Import and initialize the extension
        const extensionModule = require('./dist/extension');
        await extensionModule.activate(mockContext);
        
        // Call the diagnostics command (would be handled directly by our mock)
        console.log('--------- DIAGNOSTICS OUTPUT ---------');
        await mockVscode.commands.executeCommand('devtoolkit.runDiagnostics');
        console.log('--------- END DIAGNOSTICS OUTPUT ---------');
        
        console.log('Diagnostics completed successfully.');
    } catch (error) {
        console.error('Error running diagnostics:', error);
    }
}

runDiagnostics().catch(console.error);
