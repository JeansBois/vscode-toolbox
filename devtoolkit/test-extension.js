// Test script to run the DevToolkit extension
const vscode = require('vscode');

async function activateAndTestExtension() {
    console.log('Starting DevToolkit test...');
    
    try {
        // Wait for the extension to be activated
        const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
        
        if (!extension) {
            console.error('DevToolkit extension not found');
            return;
        }
        
        if (!extension.isActive) {
            console.log('Activating DevToolkit extension...');
            await extension.activate();
            console.log('DevToolkit extension activated');
        } else {
            console.log('DevToolkit extension is already active');
        }
        
        // Execute the openPanel command
        console.log('Opening DevToolkit panel...');
        await vscode.commands.executeCommand('devtoolkit.openPanel');
        console.log('DevToolkit panel opened successfully');
        
    } catch (error) {
        console.error('Error testing DevToolkit:', error);
    }
}

// Run the test
activateAndTestExtension();

// Export a function that VS Code can call
module.exports = { activate: activateAndTestExtension };
