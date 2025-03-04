# WebView Message Validation System

This document explains the message validation system implemented to improve security and reliability of communication between the WebView and extension.

## Overview

The message validation system provides:

1. **Compile-time validation** using TypeScript interfaces
2. **Runtime validation** against schema definitions  
3. **Bidirectional validation** for both incoming and outgoing messages
4. **Error handling** with detailed validation failure reporting
5. **Utility functions** for creating and validating messages

## Implementation Files

- **messageSchema.ts**: Core validation system with interfaces, schemas, and utility functions
- **messageHandler.ts**: WebView-side wrapper with validation-enhanced messaging
- **panel.ts**: Extension-side message handling with validation

## Message Types

### WebView to Extension Messages

| Type | Description | Required Properties |
|------|-------------|-------------------|
| `script` | Script execution control | `action`, `scriptId` |
| `file` | File selection | `action`, `paths` |
| `theme` | Theme switching | `theme` |
| `alert` | Alert notification | `command`, `text` |

### Extension to WebView Messages

| Type | Description | Required Properties |
|------|-------------|-------------------|
| `script-selected` | Script selection notification | `scriptId` |
| `script-execution-start` | Script started | `scriptId` |
| `script-execution-complete` | Script completed | `scriptId`, `success` |
| `script-execution-error` | Script error | `scriptId`, `error` |
| `files-updated` | File selection changed | `paths`, `action` |
| `update-scripts` | Scripts list update | `scripts` |
| `update-files` | Files list update | `files` |
| `error`, `success`, `warning`, `info` | Notifications | `message` |
| `progress-update` | Progress indication | `progress` |

## Using the Validation System

### Creating Messages

```typescript
import { createMessage, ScriptMessage } from './utils/messageSchema';

// Create a validated message
const message = createMessage<ScriptMessage>('script', {
    action: 'execute',
    scriptId: 'test-script',
    files: ['file1.js']
});

// Check for validation success
if (message) {
    vscode.postMessage(message);
} else {
    console.error('Failed to create valid message');
}
```

### Validating Incoming Messages

```typescript
import { validateMessage } from './utils/messageSchema';

window.addEventListener('message', event => {
    const message = event.data;
    
    // Validate the message
    const validationResult = validateMessage(message);
    if (!validationResult.valid) {
        console.error('Invalid message received:');
        validationResult.errors.forEach(err => console.error(`- ${err}`));
        return; // Reject invalid messages
    }
    
    // Process validated message
    // ...
});
```

### Using the MessageHandler

```typescript
import { messageHandler } from './utils/messageHandler';

// Send a validated script message
messageHandler.sendScriptMessage(
    'execute',
    'example-script',
    { param1: 'value1' },
    ['file1.js', 'file2.js']
);

// Send notifications with validation
messageHandler.notifySuccess('Operation completed successfully');
messageHandler.notifyError('An error occurred');
```

## Test Files

The implementation includes several test files to verify validation functionality:

1. **test-webview-messages.html**: Test for WebView to extension message validation
2. **test-extension-messages.js**: Test for extension to WebView message validation
3. **test-webview-validation.html**: Integration test with examples

To run the tests:

- For Node.js tests: `node test-extension-messages.js`
- For browser tests: Open the HTML files in a browser

## Security Considerations

This validation system addresses several security concerns:

- **Input validation**: All message inputs are validated for type, structure, and content
- **Size limits**: String lengths and array sizes are capped to prevent DoS attacks
- **Sanitization**: Messages are sanitized to remove unexpected properties
- **Error handling**: Detailed error reporting for security monitoring
- **Injection prevention**: Type checking helps prevent injection attacks

## Best Practices

When working with the validation system:

1. Always use `createMessage()` to create new messages
2. Validate all incoming messages with `validateMessage()`
3. Use the `messageHandler` utility methods for common messages
4. Check validation results and handle errors
5. Add new message types to the schema when extending functionality
