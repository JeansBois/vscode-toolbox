import * as vscode from 'vscode';
import { validateMessage, createMessage, ScriptMessage, FileMessage, ThemeMessage } from '../webview/utils/messageSchema';

/**
 * This is a test extension command that will verify our message validation implementation
 * It can be run from the VSCode command palette when the extension is active
 */
export function activate(context: vscode.ExtensionContext) {
    // Register a command to test message validation
    let disposable = vscode.commands.registerCommand('devtoolkit.testMessageValidation', () => {
        // Create an output channel to show test results
        const outputChannel = vscode.window.createOutputChannel('DevToolkit Message Validation Test');
        outputChannel.show();

        outputChannel.appendLine('=== DevToolkit Message Validation Test ===\n');
        
        // Test valid messages
        outputChannel.appendLine('=== Testing Valid Messages ===');
        
        // Valid script message
        const validScriptMessage = createMessage<ScriptMessage>('script', {
            action: 'execute',
            scriptId: 'test-script-123',
            files: ['file1.js', 'file2.js']
        });
        
        outputChannel.appendLine(`Valid Script Message: ${JSON.stringify(validScriptMessage)}`);
        outputChannel.appendLine(`Validation Result: ${validScriptMessage ? 'PASSED' : 'FAILED'}\n`);
        
        // Valid file message
        const validFileMessage = createMessage<FileMessage>('file', {
            action: 'select',
            paths: ['path/to/file1.js', 'path/to/file2.js']
        });
        
        outputChannel.appendLine(`Valid File Message: ${JSON.stringify(validFileMessage)}`);
        outputChannel.appendLine(`Validation Result: ${validFileMessage ? 'PASSED' : 'FAILED'}\n`);
        
        // Valid theme message
        const validThemeMessage = createMessage<ThemeMessage>('theme', {
            theme: 'dark'
        });
        
        outputChannel.appendLine(`Valid Theme Message: ${JSON.stringify(validThemeMessage)}`);
        outputChannel.appendLine(`Validation Result: ${validThemeMessage ? 'PASSED' : 'FAILED'}\n`);
        
        // Test invalid messages
        outputChannel.appendLine('=== Testing Invalid Messages ===');
        
        // Missing required properties
        const invalidMessage1 = { type: 'script' }; // Missing action and scriptId
        const validationResult1 = validateMessage(invalidMessage1);
        
        outputChannel.appendLine(`Invalid Message (Missing Properties): ${JSON.stringify(invalidMessage1)}`);
        outputChannel.appendLine(`Validation Result: ${validationResult1.valid ? 'PASSED (Should Fail)' : 'FAILED (Expected)'}`);
        outputChannel.appendLine(`Errors: ${validationResult1.errors.join(', ')}\n`);
        
        // Invalid type
        const invalidMessage2 = { type: 'unknown', data: 'test' };
        const validationResult2 = validateMessage(invalidMessage2);
        
        outputChannel.appendLine(`Invalid Message (Unknown Type): ${JSON.stringify(invalidMessage2)}`);
        outputChannel.appendLine(`Validation Result: ${validationResult2.valid ? 'PASSED (Should Fail)' : 'FAILED (Expected)'}`);
        outputChannel.appendLine(`Errors: ${validationResult2.errors.join(', ')}\n`);
        
        // Invalid property type
        const invalidMessage3 = { 
            type: 'script', 
            action: 'execute', 
            scriptId: 123, // Should be string
            files: ['file1.js'] 
        };
        const validationResult3 = validateMessage(invalidMessage3);
        
        outputChannel.appendLine(`Invalid Message (Wrong Property Type): ${JSON.stringify(invalidMessage3)}`);
        outputChannel.appendLine(`Validation Result: ${validationResult3.valid ? 'PASSED (Should Fail)' : 'FAILED (Expected)'}`);
        outputChannel.appendLine(`Errors: ${validationResult3.errors.join(', ')}\n`);
        
        // Invalid action value
        const invalidMessage4 = { 
            type: 'script', 
            action: 'invalid-action', // Invalid action
            scriptId: 'test-script'
        };
        const validationResult4 = validateMessage(invalidMessage4);
        
        outputChannel.appendLine(`Invalid Message (Invalid Action): ${JSON.stringify(invalidMessage4)}`);
        outputChannel.appendLine(`Validation Result: ${validationResult4.valid ? 'PASSED (Should Fail)' : 'FAILED (Expected)'}`);
        outputChannel.appendLine(`Errors: ${validationResult4.errors.join(', ')}\n`);
        
        // Exceeds max length
        let longId = 'a'.repeat(101); // Exceeds max length of 100
        
        const invalidMessage5 = { 
            type: 'script', 
            action: 'execute',
            scriptId: longId
        };
        const validationResult5 = validateMessage(invalidMessage5);
        
        outputChannel.appendLine(`Invalid Message (Exceeds Max Length): ${JSON.stringify({ ...invalidMessage5, scriptId: 'a'.repeat(20) + '...(truncated)' })}`);
        outputChannel.appendLine(`Validation Result: ${validationResult5.valid ? 'PASSED (Should Fail)' : 'FAILED (Expected)'}`);
        outputChannel.appendLine(`Errors: ${validationResult5.errors.join(', ')}\n`);
        
        // Overall results
        const testsPassed = [
            !!validScriptMessage,
            !!validFileMessage,
            !!validThemeMessage,
            !validationResult1.valid,
            !validationResult2.valid,
            !validationResult3.valid,
            !validationResult4.valid,
            !validationResult5.valid
        ].filter(result => result).length;
        
        outputChannel.appendLine(`=== Test Results: ${testsPassed}/8 tests passed ===`);
        
        // Show information message to the user
        vscode.window.showInformationMessage('Message validation tests completed. Check output panel for results.');
    });

    context.subscriptions.push(disposable);
}
