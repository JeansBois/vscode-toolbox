# Contributing to DevToolkit Templates

Thank you for your interest in contributing to DevToolkit's template system! This document provides guidelines for contributing specifically to the templates component of the DevToolkit extension.

## Template Development

Templates are an essential part of DevToolkit, providing the starting point for new scripts. A well-designed template makes it easier for users to create effective and secure scripts.

### Template Structure

Each template consists of:

1. **Python Script File**: The actual template code users will start with
2. **Manifest File**: Defines metadata, permissions, and configuration

### Python Script Template Guidelines

- Include comprehensive docstrings at the top of the file
- Provide clear examples in comments
- Include error handling patterns
- Use type hints where appropriate
- Follow PEP 8 style guidelines
- Include placeholder functions for common operations

### Manifest Template Guidelines

- Specify minimum required permissions only
- Include appropriate resource limits
- Document all configuration options
- Provide sample script_info fields

## Adding a New Template

1. Create your template Python file in the `templates/variants/` directory
2. Create a corresponding manifest file in the same directory
3. Add appropriate documentation for your template
4. Test your template with the extension
5. Submit a pull request with your additions

## Template Categories

We organize templates into several categories:

- **Basic**: Simple single-purpose scripts
- **Data Processing**: Scripts focused on data manipulation
- **File Analysis**: Scripts for analyzing file content or structure
- **Project Tools**: Scripts that interface with development projects

When submitting a new template, please indicate which category it belongs to.

## Security Considerations

Templates play a crucial role in setting security expectations. When creating templates:

- Request only the minimum necessary permissions
- Include clear comments about security implications
- Document any external API or system calls
- Set appropriate resource limits in the manifest

## Testing Your Templates

Before submitting a template:

1. Create a new script using your template in DevToolkit
2. Verify all imports and dependencies work correctly
3. Test execution in different environments
4. Validate the manifest is correctly processed

## Template Versioning

When updating existing templates:

1. Increment the version number in the manifest
2. Document changes in the template header
3. Update any affected documentation
4. Consider backward compatibility

Thank you for helping improve DevToolkit's template system!
