import re

with open('vite.config.ts') as f:
    content = f.read()

# Remove string contents to avoid counting braces inside strings
# Handle single-quoted, double-quoted, and template literals
no_strings = re.sub(r'"(?:[^"\\]|\\.)*"', r'""', content)
no_strings = re.sub(r"'(?:[^'\\]|\\.)*'", r"''", no_strings)
no_strings = re.sub(r'`(?:[^`\\]|\\.)*`', '``', no_strings)
# Also remove regex literals
no_strings = re.sub(r'/(?:[^/\\]|\\.)*/[gimsuy]*', '//', no_strings)

actual_opens = no_strings.count('{')
actual_closes = no_strings.count('}')

print(f"Actual {{ in code: {actual_opens}")
print(f"Actual }} in code: {actual_closes}")
print(f"Net balance: {actual_opens - actual_closes}")
