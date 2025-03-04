#!/usr/bin/env python3
"""
Sandbox wrapper for secure Python script execution.
This wrapper applies security restrictions to the executed script.
"""
import sys
import os
import json
import importlib
import importlib.util
import types
import builtins
import io
from pathlib import Path

# Default security profile if none provided
DEFAULT_SECURITY_PROFILE = {
    "allowed_imports": ["os.path", "sys", "typing", "json", "datetime", "math"],
    "filesystem": {
        "read_paths": [],
        "write_paths": [],
        "allow_delete": False
    },
    "network": {
        "allowed_hosts": [],
        "allowed_ports": [],
        "allow_localhost": False
    },
    "system": {
        "allowed_calls": [],
        "allow_subprocesses": False
    },
    "environment": {
        "allow_access": False
    }
}

class SecurityError(Exception):
    """Exception raised for security violations."""
    pass

class RestrictedImportHook:
    """Import hook that restricts which modules can be imported."""
    def __init__(self, allowed_imports):
        self.allowed_imports = allowed_imports
        self.original_import = builtins.__import__
        
    def __enter__(self):
        builtins.__import__ = self.secure_import
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        builtins.__import__ = self.original_import
        
    def secure_import(self, name, globals=None, locals=None, fromlist=(), level=0):
        # Check if the module or its parent package is allowed
        module_parts = name.split('.')
        base_module = module_parts[0]
        
        if base_module not in self.allowed_imports and name not in self.allowed_imports:
            print(f"Security violation: Attempted to import restricted module '{name}'", file=sys.stderr)
            raise SecurityError(f"Import of '{name}' is not allowed")
            
        # Special case for known dangerous modules that should never be imported regardless of allowlist
        dangerous_modules = [
            'subprocess', 'os.system', 'shutil.rmtree', 'pty', 
            'socket', 'smtplib', 'ftplib'
        ]
        
        if any(name.startswith(dangerous) for dangerous in dangerous_modules):
            print(f"Security violation: Attempted to import dangerous module '{name}'", file=sys.stderr)
            raise SecurityError(f"Import of '{name}' is not allowed for security reasons")
            
        # Allow the import to proceed with the original import function
        return self.original_import(name, globals, locals, fromlist, level)

class RestrictedFileSystem:
    """Restricts file system operations."""
    def __init__(self, read_paths, write_paths, allow_delete):
        self.read_paths = [os.path.abspath(p) for p in read_paths]
        self.write_paths = [os.path.abspath(p) for p in write_paths]
        self.allow_delete = allow_delete
        
        # Save original functions
        self.original_open = builtins.open
        
    def __enter__(self):
        builtins.open = self.secure_open
        # Also restrict pathlib operations
        Path.open = self.secure_path_open
        if not self.allow_delete:
            # Block file deletion functions
            os.remove = self.block_remove
            os.unlink = self.block_remove
            
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        builtins.open = self.original_open
        
    def is_path_allowed(self, filepath, write_mode=False):
        """Check if a file path is allowed based on permissions."""
        filepath = os.path.abspath(filepath)
        
        # First check write paths if in write mode
        if write_mode:
            for allowed_path in self.write_paths:
                if filepath.startswith(allowed_path):
                    return True
            print(f"Security violation: Write access denied to '{filepath}'", file=sys.stderr)
            return False
            
        # Then check read paths
        for allowed_path in self.read_paths:
            if filepath.startswith(allowed_path):
                return True
                
        print(f"Security violation: Read access denied to '{filepath}'", file=sys.stderr)
        return False
        
    def secure_open(self, file, mode='r', *args, **kwargs):
        """Secure version of open() that checks permissions."""
        # Determine if this is a write operation
        write_mode = any(char in mode for char in 'wax+')
        
        if not self.is_path_allowed(file, write_mode):
            raise SecurityError(f"Access to file '{file}' {'for writing ' if write_mode else ''}is not allowed")
            
        return self.original_open(file, mode, *args, **kwargs)
        
    def secure_path_open(self, path_self, mode='r', *args, **kwargs):
        """Secure version of Path.open() that checks permissions."""
        filepath = str(path_self)
        write_mode = any(char in mode for char in 'wax+')
        
        if not self.is_path_allowed(filepath, write_mode):
            raise SecurityError(f"Access to file '{filepath}' {'for writing ' if write_mode else ''}is not allowed")
            
        return self.original_open(filepath, mode, *args, **kwargs)
        
    def block_remove(self, path, *args, **kwargs):
        """Block file deletion operations."""
        print(f"Security violation: File deletion operation blocked on '{path}'", file=sys.stderr)
        raise SecurityError("File deletion operations are not allowed")

class RestrictedNetwork:
    """Restricts network operations."""
    def __init__(self, allowed_hosts, allowed_ports, allow_localhost):
        self.allowed_hosts = allowed_hosts
        self.allowed_ports = allowed_ports
        self.allow_localhost = allow_localhost
        
    def __enter__(self):
        # Try to patch socket if it exists
        try:
            import socket
            self.original_socket = socket.socket
            socket.socket = self.secure_socket
            
            # Try to patch common network libraries
            try:
                import urllib.request
                self.original_urlopen = urllib.request.urlopen
                urllib.request.urlopen = self.secure_urlopen
            except (ImportError, AttributeError):
                pass
                
            try:
                import http.client
                self.original_http_connect = http.client.HTTPConnection.__init__
                http.client.HTTPConnection.__init__ = self.secure_http_connect
            except (ImportError, AttributeError):
                pass
        except ImportError:
            pass
            
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Restore original functions if we patched them
        try:
            import socket
            socket.socket = self.original_socket
        except (ImportError, AttributeError):
            pass
            
    def is_host_allowed(self, host):
        """Check if a host is allowed based on permissions."""
        if '*' in self.allowed_hosts:  # Wildcard allows all hosts
            return True
            
        if self.allow_localhost and (host == 'localhost' or host == '127.0.0.1'):
            return True
            
        return host in self.allowed_hosts
        
    def is_port_allowed(self, port):
        """Check if a port is allowed based on permissions."""
        if not self.allowed_ports:  # Empty list means no ports allowed
            return False
            
        return port in self.allowed_ports
        
    def secure_socket(self, *args, **kwargs):
        """Secure version of socket.socket that enforces network restrictions."""
        # This is a simplistic implementation
        # In a real-world scenario, you would intercept connect() calls instead
        print("Network access attempted but may be restricted", file=sys.stderr)
        
        if not self.allowed_hosts:
            raise SecurityError("Network access is not allowed")
            
        return self.original_socket(*args, **kwargs)
        
    def secure_urlopen(self, url, *args, **kwargs):
        """Secure version of urllib.request.urlopen that enforces network restrictions."""
        from urllib.parse import urlparse
        
        parsed_url = urlparse(url)
        host = parsed_url.netloc.split(':')[0]
        port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)
        
        if not self.is_host_allowed(host):
            raise SecurityError(f"Access to host '{host}' is not allowed")
            
        if not self.is_port_allowed(port):
            raise SecurityError(f"Access to port {port} is not allowed")
            
        return self.original_urlopen(url, *args, **kwargs)
        
    def secure_http_connect(self, _self, host, port=None, *args, **kwargs):
        """Secure version of HTTPConnection.__init__ that enforces network restrictions."""
        port = port or 80
        
        if not self.is_host_allowed(host):
            raise SecurityError(f"Access to host '{host}' is not allowed")
            
        if not self.is_port_allowed(port):
            raise SecurityError(f"Access to port {port} is not allowed")
            
        return self.original_http_connect(_self, host, port, *args, **kwargs)

class RestrictedEnvironment:
    """Restricts access to environment variables."""
    def __init__(self, allow_access):
        self.allow_access = allow_access
        self.allowed_env_vars = ['PATH', 'PYTHONPATH', 'LANG', 'PYTEST_CURRENT_TEST', 'PYTHONIOENCODING']
        
    def __enter__(self):
        if not self.allow_access:
            # Save original os.environ
            self.original_environ = os.environ.copy()
            
            # Replace os.environ with a restricted version
            restricted_env = {k: v for k, v in os.environ.items() if k in self.allowed_env_vars}
            os.environ.clear()
            os.environ.update(restricted_env)
            
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if not self.allow_access:
            # Restore original environment
            os.environ.clear()
            os.environ.update(self.original_environ)

class SandboxException(Exception):
    """Exception raised for sandbox setup failures."""
    pass

def apply_security_restrictions(security_profile):
    """Apply security restrictions based on the provided profile."""
    restrictions = []
    
    # Restrict imports
    import_hook = RestrictedImportHook(security_profile.get('allowed_imports', 
                                       DEFAULT_SECURITY_PROFILE['allowed_imports']))
    restrictions.append(import_hook)
    
    # Restrict file system
    fs_profile = security_profile.get('filesystem', DEFAULT_SECURITY_PROFILE['filesystem'])
    fs_restrictor = RestrictedFileSystem(
        fs_profile.get('read_paths', []),
        fs_profile.get('write_paths', []),
        fs_profile.get('allow_delete', False)
    )
    restrictions.append(fs_restrictor)
    
    # Restrict network
    network_profile = security_profile.get('network', DEFAULT_SECURITY_PROFILE['network'])
    network_restrictor = RestrictedNetwork(
        network_profile.get('allowed_hosts', []),
        network_profile.get('allowed_ports', []),
        network_profile.get('allow_localhost', False)
    )
    restrictions.append(network_restrictor)
    
    # Restrict environment access
    env_profile = security_profile.get('environment', DEFAULT_SECURITY_PROFILE['environment'])
    env_restrictor = RestrictedEnvironment(env_profile.get('allow_access', False))
    restrictions.append(env_restrictor)
    
    return restrictions

def run_sandboxed_script(script_path, security_profile):
    """Run a script with security restrictions applied."""
    if not os.path.exists(script_path):
        raise SandboxException(f"Script not found: {script_path}")
        
    # Apply security restrictions
    restrictions = apply_security_restrictions(security_profile)
    
    try:
        # Enter all restriction contexts
        for restriction in restrictions:
            restriction.__enter__()
            
        # Create a clean namespace for script execution
        script_globals = {
            '__name__': '__main__',
            '__file__': script_path,
        }
        
        # Read the script content
        with open(script_path, 'r') as f:
            script_content = f.read()
            
        # Execute the script in the restricted environment
        exec(compile(script_content, script_path, 'exec'), script_globals)
        
    except Exception as e:
        print(f"Error executing script: {str(e)}", file=sys.stderr)
        if isinstance(e, SecurityError):
            print("Security violation detected!", file=sys.stderr)
        raise
    finally:
        # Exit all restriction contexts in reverse order
        for restriction in reversed(restrictions):
            restriction.__exit__(None, None, None)

def main():
    """Main function to run the sandbox wrapper."""
    if len(sys.argv) < 2:
        print("Usage: sandbox_wrapper.py <script_path> [security_profile_json]", file=sys.stderr)
        sys.exit(1)
        
    script_path = sys.argv[1]
    
    # Parse security profile if provided
    security_profile = DEFAULT_SECURITY_PROFILE
    if len(sys.argv) > 2:
        try:
            security_profile = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            print("Error: Invalid security profile JSON", file=sys.stderr)
            sys.exit(1)
            
    try:
        # Run the script with security restrictions
        run_sandboxed_script(script_path, security_profile)
    except SandboxException as e:
        print(f"Sandbox error: {str(e)}", file=sys.stderr)
        sys.exit(1)
    except SecurityError as e:
        print(f"Security violation: {str(e)}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Script execution error: {str(e)}", file=sys.stderr)
        # Re-raise to let the script's error propagate
        raise

if __name__ == "__main__":
    main()
