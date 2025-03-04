/**
 * Extension Message Validation Test
 * 
 * This script tests the validation of messages from the extension to WebView
 * Run with: node test-extension-messages.js
 */

// Mock-up of our validation schema - this would normally be imported from messageSchema.ts
const schemas = {
    'script-selected': {
        requiredProps: ['type', 'scriptId'],
        propValidators: {
            'type': (val) => val === 'script-selected',
            'scriptId': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'script-execution-start': {
        requiredProps: ['type', 'scriptId'],
        propValidators: {
            'type': (val) => val === 'script-execution-start',
            'scriptId': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'script-execution-complete': {
        requiredProps: ['type', 'scriptId', 'success'],
        propValidators: {
            'type': (val) => val === 'script-execution-complete',
            'scriptId': (val) => typeof val === 'string' && val.length > 0,
            'success': (val) => typeof val === 'boolean',
            'result': (val) => !val || typeof val === 'object'
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'error': {
        requiredProps: ['type', 'message'],
        propValidators: {
            'type': (val) => val === 'error',
            'message': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'message': 1000
        }
    }
};

// Basic schema validation
function validateMessage(message, type) {
    const result = { 
        valid: true, 
        errors: [] 
    };

    // Basic validation
    if (!message || typeof message !== 'object') {
        result.valid = false;
        result.errors.push('Message must be an object');
        return result;
    }

    // Type check
    const messageType = type || message.type;
    if (!messageType) {
        result.valid = false;
        result.errors.push('Message type is required');
        return result;
    }

    // Validate against specific schema
    const schema = schemas[messageType];
    if (!schema) {
        result.valid = false;
        result.errors.push(`Unknown message type: ${messageType}`);
        return result;
    }

    // Check required properties
    for (const prop of schema.requiredProps) {
        if (message[prop] === undefined) {
            result.valid = false;
            result.errors.push(`Required property missing: ${prop}`);
        }
    }

    // Validate property types and values
    for (const [prop, validator] of Object.entries(schema.propValidators)) {
        if (message[prop] !== undefined && !validator(message[prop])) {
            result.valid = false;
            result.errors.push(`Property validation failed: ${prop}`);
        }
    }

    // Check max lengths
    if (schema.maxLength) {
        for (const [prop, maxLen] of Object.entries(schema.maxLength)) {
            if (message[prop] && typeof message[prop] === 'string' && message[prop].length > maxLen) {
                result.valid = false;
                result.errors.push(`Property '${prop}' exceeds max length: ${message[prop].length}/${maxLen}`);
            }
        }
    }

    return result;
}

// Test cases
const testCases = [
    {
        name: "Valid script-selected message",
        message: {
            type: "script-selected",
            scriptId: "test-script-123"
        },
        expectValid: true
    },
    {
        name: "Valid script-execution-start message",
        message: {
            type: "script-execution-start",
            scriptId: "test-script-123"
        },
        expectValid: true
    },
    {
        name: "Valid script-execution-complete message",
        message: {
            type: "script-execution-complete",
            scriptId: "test-script-123",
            success: true,
            result: { output: "test output" }
        },
        expectValid: true
    },
    {
        name: "Valid error message",
        message: {
            type: "error",
            message: "An error occurred"
        },
        expectValid: true
    },
    {
        name: "Invalid message - missing required property",
        message: {
            type: "script-selected"
            // Missing scriptId
        },
        expectValid: false
    },
    {
        name: "Invalid message - wrong property type",
        message: {
            type: "script-execution-complete",
            scriptId: "test-script-123",
            success: "not-a-boolean" // Should be boolean
        },
        expectValid: false
    },
    {
        name: "Invalid message - unknown type",
        message: {
            type: "unknown-type",
            data: "some data"
        },
        expectValid: false
    },
    {
        name: "Invalid message - exceeds max length",
        message: {
            type: "error",
            message: "x".repeat(1001) // Exceeds max length of 1000
        },
        expectValid: false
    }
];

// Run the tests
console.log("Extension Message Validation Test\n");

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Message: ${JSON.stringify(testCase.message)}`);
    
    const result = validateMessage(testCase.message);
    const passed = result.valid === testCase.expectValid;
    
    console.log(`Validation result: ${result.valid ? 'Valid' : 'Invalid'}`);
    if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.join(', ')}`);
    }
    
    console.log(`Test ${passed ? 'PASSED' : 'FAILED'}`);
    console.log("-------------------------------------------");
});

// Summary
const passedTests = testCases.filter(test => {
    const result = validateMessage(test.message);
    return result.valid === test.expectValid;
}).length;

console.log(`\nSummary: ${passedTests}/${testCases.length} tests passed`);
