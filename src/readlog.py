import re
import sys
from pathlib import Path

dump = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "AppData" / "Local" / "Temp" / "crayon-build" / "test-out.html"
errp = Path(sys.argv[2]) if len(sys.argv) > 2 else dump.with_name("test-err.txt")
t = dump.read_text(encoding="utf-8", errors="replace")
m = re.search(r'id="testlog"[^>]*>(.*?)</pre>', t, re.S)
print(m.group(1) if m else "NO LOG")
tm = re.search(r"<title>(.*?)</title>", t)
print("TITLE", tm.group(1) if tm else "none")
if errp.exists():
    err = errp.read_text(encoding="utf-8", errors="replace")
    print("ERR", err[:800])
print("OUTLEN", len(t))
