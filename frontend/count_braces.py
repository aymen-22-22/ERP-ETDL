with open('vite.config.ts') as f:
    lines = f.readlines()

level = 0
for i, line in enumerate(lines, 1):
    opens = line.count('{')
    closes = line.count('}')
    net = opens - closes
    if net:
        print(f"Line {i}: braces={net:+d} | {line.rstrip()[:60]}")
    level += net
    if level < 0:
        print(f"  *** NEGATIVE at line {i} (level={level}) ***")

print(f"Final level: {level}")
