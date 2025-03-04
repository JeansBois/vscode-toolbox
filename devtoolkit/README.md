# DevToolkit Extension for VS Code

A comprehensive VS Code extension for development tools with integrated Python support, script management, and security sandboxing.

![DevToolkit Logo](media/icon.svg)

## Features

- **Secure Python Script Management**
  - Execute Python scripts within a security sandbox
  - Manage script dependencies and environments
  - Validate script security and resource constraints
  - Prevent unauthorized access and resource abuse

- **Integrated Script Management UI**
  - WebView-based interface for script management
  - Script creation, modification, and execution
  - Template-based script creation
  - Script categorization and organization

- **File Checklist System**
  - Track important files for review
  - Organize files by project or task
  - Integrated with VS Code's file system

- **Python Environment Management**
  - Automatic Python interpreter detection
  - Virtual environment support
  - Package dependency management
  - Version compatibility checking

## Installation

### Prerequisites

- Node.js (v16 or higher)
- Python (v3.6 or higher)
- Visual Studio Code (v1.85.0 or higher)

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "DevToolkit"
4. Click Install

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/username/devtoolkit.git
   cd devtoolkit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Package the extension:
   ```bash
   npm run vscode:prepublish
   npx vsce package
   ```

4. Install the generated .vsix file in VS Code:
   - Go to Extensions view
   - Click "..." in the top-right
   - Select "Install from VSIX..."
   - Choose the generated .vsix file

## Configuration

DevToolkit provides extensive configuration options accessible through VS Code's settings. You can customize these settings by opening VS Code settings (Ctrl+, / Cmd+,) and searching for "DevToolkit".

### Python Configuration

- `devtoolkit.pythonPath`: Path to Python interpreter (default: auto-detected)
- `devtoolkit.workspace.pythonEnvironment.useVirtualEnv`: Enable virtual environment support
- `devtoolkit.workspace.pythonEnvironment.virtualEnvPath`: Path to virtual environment
- `devtoolkit.workspace.pythonEnvironment.requirementsPath`: Path to requirements.txt file

### Script Management

- `devtoolkit.scriptsDirectory`: Main directory for scripts
- `devtoolkit.workspace.scriptDirectories`: Additional workspace-specific script directories
- `devtoolkit.templates.directory`: Directory for script templates
- `devtoolkit.templates.defaultTemplate`: Default template for new scripts
- `devtoolkit.templates.customTemplates`: List of custom templates

### Security Settings

- `devtoolkit.security.allowedPaths`: Paths scripts are allowed to access
- `devtoolkit.security.blockedExtensions`: File extensions that cannot be executed
- `devtoolkit.logging.level`: Log level (debug, info, warn, error)

## Usage

### Getting Started

1. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Search for "DevToolkit: Open Panel"
3. The main interface will open in a new tab

### Working with Scripts

#### Creating a New Script

1. From the DevToolkit panel, click "Create New Script"
2. Select a template
3. Fill in script information (name, ID, description)
4. Click "Create"

#### Running Scripts

1. From the DevToolkit panel, find your script in the scripts list
2. Click the "Run" button next to the script
3. Output will appear in the output panel

Alternatively, right-click on a Python file in the Explorer and select "DevToolkit: Run Script".

#### Managing Script Dependencies

1. Open the script's manifest file (scriptId_manifest.json)
2. Add dependencies to the "dependencies" array
3. Save the file
4. DevToolkit will automatically install dependencies when the script runs

### Using the File Checklist

1. Right-click on any file in the Explorer
2. Select "DevToolkit: Add to Checklist"
3. The file will appear in the Checklist panel

## Script Security

DevToolkit enforces security through a comprehensive sandboxing system:

- **Permission Management**: Scripts must declare required permissions in their manifest
- **Resource Limits**: CPU, memory, and execution time constraints can be enforced
- **Path Restrictions**: Scripts can only access allowed directories
- **Import Validation**: Only approved module imports are permitted
- **Network Controls**: Network access can be restricted or disabled

Example security configuration in a script manifest:

```json
"validation": {
  "permissions": {
    "allowedImports": ["os", "sys", "json"],
    "fileSystemPermissions": {
      "read": ["${workspaceFolder}/data"],
      "write": ["${workspaceFolder}/output"],
      "delete": false
    },
    "networkPermissions": {
      "allowedHosts": ["api.example.com"],
      "allowLocalhost": true
    }
  }
}
```

## Troubleshooting

### Python Detection Issues

If DevToolkit cannot find your Python installation:

1. Check that Python is installed and in your PATH
2. Configure `devtoolkit.pythonPath` manually in VS Code settings
3. Check the extension logs for specific errors

### Script Execution Errors

Common issues with script execution:

- **Permission Denied**: The script lacks required permissions. Check the script manifest
- **Timeout Error**: The script exceeded its execution time limit
- **Import Error**: The script tried to import a module not in the allowedImports list
- **Resource Limit Exceeded**: The script exceeded CPU or memory limits

### Extension Activation Fails

If the extension fails to activate:

1. Check that you have the required prerequisites installed
2. Check the VS Code logs for specific error messages
3. Try reinstalling the extension

## Development

### Project Structure

```
/devtoolkit
  /src
    /webview              # UI components
    /script-manager       # Script management logic
    /file-manager         # Checklist system
    /python-runtime       # Python execution environment
    /config               # Configuration management
    /utils                # Shared utilities
  /templates              # Script templates
  /scripts                # Built-in scripts
  /media                  # Icons and other resources
```

### Building and Testing

- `npm run compile`: Compile TypeScript code
- `npm run watch`: Compile in watch mode
- `npm run build-webview`: Build WebView components
- `npm run watch-webview`: Build WebView components in watch mode
- `npm test`: Run all tests
- `npm run test:unit`: Run unit tests only
- `npm run test:integration`: Run integration tests only

### Debugging

1. Open the project in VS Code
2. Press F5 to launch a new VS Code instance with the extension
3. Set breakpoints in the TypeScript code
4. Use the Debug Console to view logs and evaluate expressions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.

## License

[MIT](LICENSE)
