import argparse
import os
import re
import sys
from typing import Set, List

## python dependency_scanner.py --input context/ --output dependencies.txt

class DependencyScanner:
    def __init__(self):
        # Initialize with Python standard library modules to filter them out
        self.std_lib_modules = self._get_standard_library_modules()
        
        # Regex patterns for different import styles
        self.import_patterns = [
            r'^import\s+([\w\s,]+)(?:\s+as\s+\w+)?$',  # import pandas as pd, numpy as np
            r'^from\s+([\w\.]+)\s+import\s+[\w\s,\*]+$',  # from datetime import datetime
        ]
    
    def _get_standard_library_modules(self) -> Set[str]:
        """Get a set of Python standard library module names."""
        return set(sys.stdlib_module_names)
    
    def _clean_module_name(self, module: str) -> str:
        """Clean module name by removing whitespace and getting base module."""
        module = module.strip()
        # Get base module name (e.g., 'pandas.core' -> 'pandas')
        return module.split('.')[0]
    
    def extract_dependencies(self, content: str) -> Set[str]:
        """Extract Python dependencies from text content."""
        dependencies = set()
        
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
                
            for pattern in self.import_patterns:
                matches = re.match(pattern, line)
                if matches:
                    # Extract module names from the match
                    modules = matches.group(1).split(',')
                    for module in modules:
                        base_module = self._clean_module_name(module)
                        if base_module and base_module not in self.std_lib_modules:
                            dependencies.add(base_module)
        
        return dependencies
    
    def scan_file(self, file_path: str) -> Set[str]:
        """Scan a single file for Python dependencies."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return self.extract_dependencies(content)
        except Exception as e:
            print(f"Error scanning file {file_path}: {str(e)}", file=sys.stderr)
            return set()
    
    def scan_directory(self, dir_path: str) -> Set[str]:
        """Recursively scan directory for .txt files and extract dependencies."""
        all_dependencies = set()
        
        for root, _, files in os.walk(dir_path):
            for file in files:
                if file.endswith('.txt'):
                    file_path = os.path.join(root, file)
                    dependencies = self.scan_file(file_path)
                    all_dependencies.update(dependencies)
        
        return all_dependencies
    
    def save_dependencies(self, dependencies: Set[str], output_file: str):
        """Save dependencies to output file."""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                for dep in sorted(dependencies):
                    f.write(f"{dep}\n")
            print(f"Dependencies saved to {output_file}")
        except Exception as e:
            print(f"Error saving dependencies: {str(e)}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description='Scan text files for Python dependencies.')
    parser.add_argument('--input', required=True, help='Input file or directory path')
    parser.add_argument('--output', required=True, help='Output file path for dependencies')
    args = parser.parse_args()
    
    scanner = DependencyScanner()
    
    # Determine if input is file or directory
    if os.path.isfile(args.input):
        dependencies = scanner.scan_file(args.input)
    elif os.path.isdir(args.input):
        dependencies = scanner.scan_directory(args.input)
    else:
        print(f"Error: Input path {args.input} does not exist", file=sys.stderr)
        sys.exit(1)
    
    if dependencies:
        scanner.save_dependencies(dependencies, args.output)
        print(f"Found {len(dependencies)} unique dependencies")
    else:
        print("No dependencies found")

if __name__ == '__main__':
    main()