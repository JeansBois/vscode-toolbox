// File: src/webview/bundle.ts
// Simplify the bundle to ensure components are correctly initialized
import { ScriptsList } from './components/ScriptsList';
import { FileTree } from './components/FileTree';
import { OutputPanel } from './components/OutputPanel';
import { messageHandler } from './utils/messageHandler';

// The message handler is automatically initialized when imported
// No need to call an init() method

// Wait for complete DOM loading
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DevToolkit WebView initializing...');
        
        // Initialize the file tree component - we only need it for side effects
        new FileTree('file-tree');
        
        // Create the output panel
        const outputPanel = new OutputPanel('output-panel');
        outputPanel.log('DevToolkit initialized');
        
        // Create the scripts list
        const scriptsList = new ScriptsList('scripts-list');
        
        // Configure the run button
        const runButton = document.getElementById('runButton');
        if (runButton) {
            runButton.addEventListener('click', () => {
                const selectedScript = scriptsList.getSelectedScriptId();
                if (selectedScript) {
                    outputPanel.log(`Running script: ${selectedScript}`);
                    messageHandler.postMessage({
                        type: 'script',
                        action: 'execute',
                        scriptId: selectedScript
                    });
                } else {
                    outputPanel.warning('No script selected');
                }
            });
        }
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Message received from extension:', message);
            
            // Process messages based on their type
            if (message.type === 'update-scripts') {
                scriptsList.updateScripts(message.scripts);
            } else if (message.type === 'script-output') {
                outputPanel.log(message.content);
            } else if (message.type === 'script-error') {
                outputPanel.error(message.content);
            } else if (message.type === 'script-success') {
                outputPanel.success(message.content);
            }
        });
        
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
