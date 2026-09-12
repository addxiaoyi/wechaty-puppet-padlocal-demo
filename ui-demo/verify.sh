#!/bin/bash
# Verify HTML file integrity
FILE="/workspace/ui-demo/index.html"

echo "=== File size ==="
ls -la "$FILE"

echo ""
echo "=== Template literal balance ==="
python3 << 'PY'
import re
with open('/workspace/ui-demo/index.html', 'r', encoding='utf-8') as f:
    content = f.read()
script_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
if script_match:
    script = script_match.group(1)
    bt = script.count('`')
    print(f"Backticks: {bt} (balanced: {bt % 2 == 0})")
else:
    print("No script block")
PY

echo ""
echo "=== aria-label on icon-only buttons ==="
grep -c 'aria-label' "$FILE"

echo ""
echo "=== transition all check ==="
grep -c 'transition: all' "$FILE" || echo "0 (no transition: all found)"

echo ""
echo "=== color-scheme: dark ==="
grep -c 'color-scheme: dark' "$FILE"

echo ""
echo "=== prefers-reduced-motion ==="
grep -c 'prefers-reduced-motion' "$FILE"

echo ""
echo "=== overscroll-behavior ==="
grep -c 'overscroll-behavior' "$FILE"

echo ""
echo "=== ellipsis check ==="
grep -n '…' "$FILE" | head -5

echo ""
echo "=== theme-color ==="
grep -c 'theme-color' "$FILE"
