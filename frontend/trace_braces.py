with open('vite.config.ts') as f:
    content = f.read()

in_single = False
in_double = False
in_template = False
in_regex = False
prev_char = ''
level = 0

for i, ch in enumerate(content):
    # Track string state
    if ch == "'" and not in_double and not in_template and not in_regex and prev_char != '\\':
        in_single = not in_single
    elif ch == '"' and not in_single and not in_template and not in_regex and prev_char != '\\':
        in_double = not in_double
    elif ch == '`' and not in_single and not in_double and not in_regex and prev_char != '\\':
        in_template = not in_template
    elif ch == '/' and not in_single and not in_double and not in_template:
        if not in_regex and prev_char in ('=', '(', ',', ':', '!', ' ', '\t', '\n', '\r', '&', '|', '?'):
            in_regex = True
        elif in_regex:
            in_regex = False
    
    if not (in_single or in_double or in_template or in_regex):
        if ch == '{':
            level += 1
        elif ch == '}':
            level -= 1
            if level < 0:
                print(f"Extra }} at character {i} (around: ...{content[max(0,i-10):i+10]}...)")
                level = 0
    
    prev_char = ch

print(f"Final brace level: {level}")
