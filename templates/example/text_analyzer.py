#!/usr/bin/env python3
"""
Text File Analyzer
-----------------
Example script that demonstrates usage of the DevToolBox script template.
Analyzes text files for various statistics including:
- Line count
- Word count
- Character count
- Average word length
- Most common words
"""

import collections
import re
from pathlib import Path
from typing import Dict, Any

from ..script_template import ScriptBase

class TextAnalyzer(ScriptBase):
    """Text file analysis script implementation"""
    
    def __init__(self):
        """Initialize with manifest from same directory"""
        manifest_path = Path(__file__).parent / "text_analyzer_manifest.json"
        super().__init__(manifest_path=str(manifest_path))
        
    def _analyze_text(self, content: str) -> Dict[str, Any]:
        """
        Analyze text content and return statistics.
        
        Args:
            content: Text content to analyze
            
        Returns:
            Dict containing text statistics
        """
        # Split into lines and words
        lines = content.splitlines()
        words = re.findall(r'\b\w+\b', content.lower())
        
        # Calculate statistics
        stats = {
            "line_count": len(lines),
            "word_count": len(words),
            "char_count": len(content),
            "avg_word_length": sum(len(word) for word in words) / len(words) if words else 0,
            "empty_lines": sum(1 for line in lines if not line.strip()),
            "most_common_words": dict(collections.Counter(words).most_common(10))
        }
        
        return stats
        
    def execute(self) -> bool:
        """Implement text analysis logic"""
        try:
            input_file = Path(self.args.input_file)
            output_format = getattr(self.args, 'output_format', 'text')
            verbose = getattr(self.args, 'verbose', False)
            
            if verbose:
                self.logger.info(f"Analyzing file: {input_file}")
            
            # Read and analyze file
            with open(input_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Generate statistics
            stats = self._analyze_text(content)
            
            # Format output
            if output_format == 'json':
                output = stats
            else:
                # Format as human-readable text
                output = [
                    "Text Analysis Results",
                    "===================",
                    f"File: {input_file.name}",
                    f"Lines: {stats['line_count']} ({stats['empty_lines']} empty)",
                    f"Words: {stats['word_count']}",
                    f"Characters: {stats['char_count']}",
                    f"Average Word Length: {stats['avg_word_length']:.2f}",
                    "\nMost Common Words:",
                    "----------------"
                ]
                
                for word, count in stats['most_common_words'].items():
                    output.append(f"{word}: {count}")
                    
                output = "\n".join(output)
            
            # Generate output based on format
            self.generate_output(output, "console")
            
            # Save to file if output_file specified
            output_file = getattr(self.args, 'output_file', None)
            if output_file:
                self.generate_output(output, "file")
                
            return True
            
        except Exception as e:
            self.logger.error(f"Analysis failed: {str(e)}")
            return False

def main():
    """Script entry point"""
    analyzer = TextAnalyzer()
    sys.exit(analyzer.run())

if __name__ == "__main__":
    import sys
    main()
