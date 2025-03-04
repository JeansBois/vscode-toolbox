# Contributing to DevToolkit

Thank you for your interest in contributing to DevToolkit! This document provides guidelines and instructions for contributing to the project.

## Development Setup

### Prerequisites

- Node.js (v16 or higher)
- Python (v3.6 or higher)
- Visual Studio Code (v1.85.0 or higher)
- Git

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/username/devtoolkit.git
   cd devtoolkit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Build the WebView components:
   ```bash
   npm run build-webview
   ```

### Development Workflow

1. Start the extension in debug mode:
   - Open the project in VS Code
   - Press F5 to launch a new VS Code instance with the extension loaded
   - The extension development host will open with DevToolkit available

2. For WebView development with live updates:
   ```bash
   npm run watch-webview
   ```

3. For TypeScript compilation with live updates:
   ```bash
   npm run watch
   ```

## Project Structure

The project is organized into the following key components:

- **/src**: Main TypeScript source code
  - **/webview**: WebView UI components and utilities
  - **/script-manager**: Script management logic
  - **/file-manager**: Checklist system
  - **/python-runtime**: Python execution environment
  - **/config**: Configuration management
  - **/utils**: Shared utilities
  - **/test**: Test files and utilities

- **/templates**: Script templates
- **/scripts**: Built-in scripts
- **/media**: Icons and other resources

## Coding Standards

### TypeScript Conventions

- Use TypeScript strict mode for all files
- Follow the existing code style with 4-space indentation
- Use meaningful variable and function names
- Prefer interfaces over types for object definitions
- Use async/await pattern for asynchronous operations

### Documentation

- Add JSDoc comments to all public APIs
- Include parameter and return type descriptions
- Document potential errors and exceptions
- Provide examples for complex functions
- Keep documentation in sync with code changes

### JSDoc Format

Follow this format for JSDoc comments:

```typescript
/**
 * A brief description of the function/class
 * 
 * A more detailed description if needed, explaining the purpose,
 * behavior, and any important considerations.
 * 
 * @param paramName - Description of the parameter
 * @param anotherParam - Description of another parameter
 * @returns Description of the return value
 * @throws {ErrorType} Description of when this error is thrown
 * 
 * @example
 * // Example usage code
 * const result = someFunction('value');
 */
```

### Error Handling

- Use structured error handling with typed errors
- Wrap external API errors with contextual information
- Log errors with appropriate severity levels
- Provide user-friendly error messages in UI components

## Pull Request Process

1. Create a new branch from `main` using a descriptive name:
   - `feature/feature-name` for new features
   - `fix/bug-description` for bug fixes
   - `docs/documentation-update` for documentation changes

2. Make your changes following the coding standards

3. Write or update tests as needed:
   - Unit tests for individual functions
   - Integration tests for component interactions
   - End-to-end tests for complete workflows

4. Ensure all tests pass:
   ```bash
   npm run test:all
   ```

5. Submit a pull request to the `main` branch with:
   - A clear title and description of the changes
   - Reference to any related issues
   - Screenshots or examples if applicable

6. Address any code review feedback

## Testing Requirements

- Write unit tests for new functionality
- Ensure tests cover both success and failure cases
- Maintain or improve code coverage percentage
- Include integration tests for component interactions
- Test across supported platforms (Windows, macOS, Linux)

## Security Considerations

- Validate all user input and external data
- Apply appropriate access controls and permissions
- Use secure defaults for all features
- Document security implications of APIs
- Follow VS Code extension security best practices
- Sandbox Python script execution to prevent unauthorized access

## Component-Specific Guidelines

### WebView Components

- Use React for UI components
- Follow the established component structure
- Use TypeScript for type safety
- Validate all message passing between WebView and extension

### Python Runtime

- Ensure sandbox security is maintained
- Test with different Python versions
- Handle resource limits appropriately
- Document security implications

### Script Manager

- Validate script manifests thoroughly
- Maintain backwards compatibility where possible
- Document changes to manifest structure
- Consider security implications of script execution

## Building and Packaging

### Building the Extension

```bash
npm run vscode:prepublish
```

This will:
1. Compile the TypeScript code
2. Build the WebView components
3. Prepare the extension for packaging

### Packaging the Extension

```bash
vsce package
```

This creates a `.vsix` file that can be installed in VS Code.

## License

By contributing to DevToolkit, you agree that your contributions will be licensed under the project's MIT license.
