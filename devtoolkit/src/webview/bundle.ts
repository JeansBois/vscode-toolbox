// File: src/webview/bundle.ts
// Simplify the bundle to ensure components are correctly initialized
import { ScriptsList } from './components/ScriptsList';
import { FileTree } from './components/FileTree';
import { OutputPanel } from './components/OutputPanel';
import { messageHandler } from './utils/messageHandler';

// The message handler is automatically initialized when imported
// No need to call an init() method

// Helper function to display errors in the UI
function showErrorInUI(message: string) {
    const main = document.getElementById('main');
    if (main) {
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'var(--vscode-errorForeground)';
        errorDiv.style.padding = '20px';
        errorDiv.innerHTML = `
            <h2>DevToolkit Initialization Error</h2>
            <p>${message}</p>
            <p>Please check the console for more details or reload the extension.</p>
        `;
        main.appendChild(errorDiv);
    }
}

// Extract message handling to a separate function
function setupMessageListener(outputPanel: OutputPanel | undefined, scriptsList: ScriptsList | undefined) {
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('Message received from extension:', message);
        
        // Process messages based on their type
        if (message.type === 'update-scripts') {
            if (scriptsList) {
                try {
                    scriptsList.updateScripts(message.scripts);
                    console.log(`Updated scripts list with ${message.scripts?.length || 0} scripts`);
                } catch (error) {
                    console.error('Error updating scripts list:', error);
                }
            } else {
                console.error('Cannot update scripts list: ScriptsList not initialized');
            }
        } else if (message.type === 'script-output' && outputPanel) {
            outputPanel.log(message.content);
        } else if (message.type === 'script-error' && outputPanel) {
            outputPanel.error(message.content);
        } else if (message.type === 'script-success' && outputPanel) {
            outputPanel.success(message.content);
        } else if (message.type === 'init-data') {
            // Handle initial data from extension
            console.log('Received initialization data from extension');
            if (message.scripts && scriptsList) {
                scriptsList.updateScripts(message.scripts);
            }
        }
    });
}

// Extract run button configuration to a separate function
function configureRunButton(scriptsList: ScriptsList | undefined, outputPanel: OutputPanel | undefined) {
    const runButton = document.getElementById('runButton');
    if (runButton) {
        runButton.addEventListener('click', () => {
            if (!scriptsList) {
                console.error('Cannot run script: ScriptsList not initialized');
                return;
            }
            
            const selectedScript = scriptsList.getSelectedScriptId();
            if (selectedScript) {
                if (outputPanel) {
                    outputPanel.log(`Running script: ${selectedScript}`);
                }
                
                messageHandler.postMessage({
                    type: 'script',
                    action: 'execute',
                    scriptId: selectedScript
                });
            } else if (outputPanel) {
                outputPanel.warning('No script selected');
            }
        });
    } else {
        console.error('Run button not found in DOM');
    }
}

// Wait for complete DOM loading
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DevToolkit WebView initializing...');
        
        // Verify DOM elements exist before initializing components
        const fileTreeElement = document.getElementById('file-tree');
        if (!fileTreeElement) {
            throw new Error('Required element #file-tree not found in DOM');
        }
        
        const outputPanelElement = document.getElementById('output-panel');
        if (!outputPanelElement) {
            throw new Error('Required element #output-panel not found in DOM');
        }
        
        const scriptsListElement = document.getElementById('scripts-list');
        if (!scriptsListElement) {
            throw new Error('Required element #scripts-list not found in DOM');
        }
        
        // Initialize components with try/catch blocks
        let outputPanel, scriptsList;
        
        try {
            new FileTree('file-tree');
            console.log('FileTree initialized successfully');
        } catch (error) {
            console.error('Failed to initialize FileTree:', error);
            showErrorInUI('Failed to initialize file tree component');
        }
        
        try {
            outputPanel = new OutputPanel('output-panel');
            outputPanel.log('DevToolkit initialized');
            console.log('OutputPanel initialized successfully');
        } catch (error) {
            console.error('Failed to initialize OutputPanel:', error);
            showErrorInUI('Failed to initialize output panel component');
        }
        
        try {
            scriptsList = new ScriptsList('scripts-list');
            console.log('ScriptsList initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ScriptsList:', error);
            showErrorInUI('Failed to initialize scripts list component');
        }
        
        // Setup message listener before configuring UI interactions
        setupMessageListener(outputPanel, scriptsList);
        
        // Configure the run button after components are ready
        configureRunButton(scriptsList, outputPanel);
        
        // Indicate that everything is ready
        console.log('DevToolkit WebView initialized successfully');
        
        // Hide the loading element if it exists
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    } catch (error) {
        const errorObject = error instanceof Error ? error : new Error('Unknown error occurred');
        console.error('Error initializing DevToolkit WebView:', errorObject);
        // Display a visible error to the user
        const main = document.getElementById('main');
        if (main) {
            main.innerHTML = `<div style="color: red; padding: 20px;">
                <h2>Error initializing DevToolkit</h2>
                <p>${errorObject.message}</p>
            </div>`;
        }
    }
});

// Declare properties on the window object
declare global {
    interface Window {
        ScriptsList: typeof ScriptsList;
        FileTree: typeof FileTree;
        OutputPanel: typeof OutputPanel;
        messageHandler: typeof messageHandler;
    }
}

// Expose components for the WebView context
window.ScriptsList = ScriptsList;
window.FileTree = FileTree;
window.OutputPanel = OutputPanel;
window.messageHandler = messageHandler;
