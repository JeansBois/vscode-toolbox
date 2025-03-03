import os
import fnmatch
from pathlib import Path
from typing import List, Set
from collections import defaultdict

import argparse

class CodeAnalyzer:
    def __init__(self, root_dir: str, verbose: bool = False):
        self.root_dir = Path(root_dir)
        self.verbose = verbose
        self.ignored_patterns = self._get_ignored_patterns()
        self.stats = {
            'total_files': 0,
            'total_lines': 0,
            'files_by_type': defaultdict(int),
            'lines_by_type': defaultdict(int)
        }
        
    def log(self, message: str):
        """Print message only if verbose mode is enabled"""
        if self.verbose:
            print(message)

    def _find_gitignore_files(self) -> List[Path]:
        """Find all .gitignore files in the project"""
        gitignore_files = []
        for root, _, files in os.walk(self.root_dir):
            if '.gitignore' in files:
                gitignore_path = Path(root) / '.gitignore'
                gitignore_files.append(gitignore_path)
                self.log(f"Found .gitignore: {gitignore_path}")
        return gitignore_files

    def _get_ignored_patterns(self) -> Set[str]:
        """Get patterns to ignore from all .gitignore files and add custom patterns"""
        patterns = set()
        
        # Add custom patterns for .txt and .md files
        patterns.add('*.txt')
        patterns.add('*.md')
        
        # Read patterns from all .gitignore files
        for gitignore_path in self._find_gitignore_files():
            try:
                with open(gitignore_path, 'r', encoding='utf-8') as f:
                    # Get relative path to make patterns relative to gitignore location
                    rel_dir = os.path.relpath(gitignore_path.parent, self.root_dir)
                    if rel_dir == '.':
                        rel_dir = ''
                        
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            # Make pattern relative to gitignore location
                            if rel_dir and not any(c in line for c in ['/', '*', '$']):
                                patterns.add(os.path.join(rel_dir, line).replace('\\', '/'))
                            else:
                                patterns.add(line)
            except Exception as e:
                self.log(f"Warning: Could not read {gitignore_path}: {e}")
        
        return patterns

    def _should_ignore(self, path: str) -> bool:
        """Check if a path should be ignored based on patterns"""
        # Convert Windows path separators to Unix style for consistent matching
        path = path.replace('\\', '/')
        
        # Always ignore .txt and .md files
        if path.endswith(('.txt', '.md')):
            return True
            
        # Common patterns to always ignore
        common_ignores = [
            '__pycache__', 
            '.git', 
            'node_modules', 
            '.pytest_cache',
            'venv',
            'env',
            'ENV',
            '.env',
            '.venv',
            'node_modules',
        ]
        if any(pattern in path for pattern in common_ignores):
            return True
            
        # Skip binary and generated files
        if path.endswith(('.pyc', '.pyo', '.pyd', '.so', '.dll', '.exe')):
            return True
            
        # For other patterns, be more selective
        for pattern in self.ignored_patterns:
            pattern = pattern.replace('\\', '/')
            
            # Skip complex patterns that might be too aggressive
            if pattern.startswith('**/') or pattern == '*':
                continue
                
            # Handle directory-specific patterns
            if '/' in pattern:
                if pattern.startswith('/'):
                    pattern = pattern[1:]
                if fnmatch.fnmatch(path, pattern):
                    self.log(f"Ignored by pattern '{pattern}': {path}")
                    return True
            else:
                # For simple patterns, only match against filename
                filename = path.split('/')[-1]
                if fnmatch.fnmatch(filename, pattern):
                    self.log(f"Ignored by pattern '{pattern}': {path}")
                    return True
        
        return False

    def _count_lines(self, file_path: Path) -> int:
        """Count non-empty lines in a file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return sum(1 for line in f if line.strip())
        except (UnicodeDecodeError, Exception):
            return 0

    def analyze(self):
        """Analyze the codebase and collect statistics"""
        self.log(f"\nAnalyzing directory: {self.root_dir}")
        
        for root, dirs, files in os.walk(self.root_dir):
            rel_path = os.path.relpath(root, self.root_dir)
            
            # Skip common ignored directories
            common_dirs = ['node_modules', '__pycache__', '.git', 'venv', 'env', 'ENV', '.env', '.venv']
            if any(d in rel_path for d in common_dirs):
                self.log(f"Skipping common ignored directory: {rel_path}")
                continue
                
            for file in files:
                file_path = Path(root) / file
                rel_file_path = os.path.relpath(file_path, self.root_dir)
                
                # Skip ignored files
                if self._should_ignore(rel_file_path):
                    self.log(f"Skipping ignored file: {rel_file_path}")
                    continue
                
                # Get file extension
                ext = file_path.suffix.lower() or 'no_extension'
                if ext.startswith('.'):
                    ext = ext[1:]
                
                # Skip binary and generated files
                if ext in ['pyc', 'pyo', 'pyd', 'so', 'dll', 'exe']:
                    continue
                
                try:
                    # Count lines
                    lines = self._count_lines(file_path)
                    
                    # Update statistics
                    self.stats['total_files'] += 1
                    self.stats['total_lines'] += lines
                    self.stats['files_by_type'][ext] += 1
                    self.stats['lines_by_type'][ext] += lines
                    
                    self.log(f"Analyzed: {rel_file_path} ({lines} lines)")
                except Exception as e:
                    self.log(f"Error analyzing {rel_file_path}: {e}")

    def get_report(self) -> str:
        """Generate a formatted report of the analysis"""
        report = []
        report.append("Code Analysis Report")
        report.append("=" * 50)
        report.append(f"\nTotal Files: {self.stats['total_files']}")
        report.append(f"Total Lines of Code: {self.stats['total_lines']}")
        
        report.append("\nFiles by Type:")
        report.append("-" * 20)
        for ext, count in sorted(self.stats['files_by_type'].items()):
            report.append(f"{ext}: {count} files")
        
        report.append("\nLines of Code by Type:")
        report.append("-" * 25)
        for ext, lines in sorted(self.stats['lines_by_type'].items()):
            report.append(f"{ext}: {lines} lines")
        
        return "\n".join(report)

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Analyze code files in a directory')
    parser.add_argument('-v', '--verbose', action='store_true', 
                      help='Enable verbose logging')
    args = parser.parse_args()
    
    # Get the current directory
    current_dir = os.getcwd()
    
    # Create and run analyzer
    analyzer = CodeAnalyzer(current_dir, verbose=args.verbose)
    analyzer.analyze()
    
    # Print report
    print(analyzer.get_report())

if __name__ == "__main__":
    main()