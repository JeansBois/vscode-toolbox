import argparse
import json
import sys
import time
from typing import Dict, List, Optional
import urllib.request
import urllib.error

## python version_checker.py --input dependencies.txt --output latest_versions.txt

class PackageVersionChecker:
    def __init__(self):
        self.pypi_url = "https://pypi.org/pypi/{package}/json"
        self.headers = {
            'User-Agent': 'Python Package Version Checker 1.0'
        }
    
    def get_latest_version(self, package: str) -> Optional[str]:
        """Query PyPI API for the latest version of a package."""
        try:
            url = self.pypi_url.format(package=package)
            request = urllib.request.Request(url, headers=self.headers)
            
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.loads(response.read())
                return data['info']['version']
                
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"Package not found: {package}", file=sys.stderr)
            else:
                print(f"HTTP error for {package}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Error checking version for {package}: {e}", file=sys.stderr)
        
        return None
    
    def read_dependencies(self, input_file: str) -> List[str]:
        """Read package names from input file."""
        try:
            with open(input_file, 'r', encoding='utf-8') as f:
                return [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"Error reading input file: {e}", file=sys.stderr)
            return []
    
    def check_versions(self, packages: List[str]) -> Dict[str, Optional[str]]:
        """Get latest versions for all packages."""
        results = {}
        total = len(packages)
        
        print(f"Checking versions for {total} packages...")
        
        for i, package in enumerate(packages, 1):
            print(f"[{i}/{total}] Checking {package}...", end='\r')
            version = self.get_latest_version(package)
            results[package] = version
            # Small delay to be nice to PyPI
            time.sleep(0.5)
        
        print("\nVersion check complete!")
        return results
    
    def save_results(self, results: Dict[str, Optional[str]], output_file: str):
        """Save results to output file."""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                for package, version in sorted(results.items()):
                    if version:
                        f.write(f"{package}=={version}\n")
                    else:
                        f.write(f"# {package} (version not found)\n")
            print(f"Results saved to {output_file}")
        except Exception as e:
            print(f"Error saving results: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(
        description='Check latest versions of Python packages from a dependency list.'
    )
    parser.add_argument('--input', required=True,
                      help='Input file containing package names (one per line)')
    parser.add_argument('--output', required=True,
                      help='Output file path for version information')
    args = parser.parse_args()
    
    checker = PackageVersionChecker()
    
    # Read dependencies
    packages = checker.read_dependencies(args.input)
    if not packages:
        print("No packages found in input file")
        sys.exit(1)
    
    # Check versions
    results = checker.check_versions(packages)
    
    # Save results
    checker.save_results(results, args.output)
    
    # Print summary
    found = sum(1 for v in results.values() if v is not None)
    print(f"\nSummary: Found versions for {found}/{len(packages)} packages")

if __name__ == '__main__':
    main()