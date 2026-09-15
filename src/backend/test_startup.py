import subprocess
import sys
import os
import time

print("Starting uvicorn test...")
env = os.environ.copy()
env["PYTHONUNBUFFERED"] = "1"

# Run uvicorn as a subprocess, capture output
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    encoding="utf-8",
    env=env,
    cwd=r"C:\Users\Mtl\Downloads\RUL Dashboard"
)

# Wait a bit for it to start and potentially crash
time.sleep(15)

if proc.poll() is None:
    print("Process is still running! Terminating...")
    proc.terminate()
    proc.wait()

stdout, _ = proc.communicate()

with open("backend_test_log.txt", "w", encoding="utf-8") as f:
    f.write(f"Exit code: {proc.returncode}\n")
    f.write(stdout)

print("Done. Wrote backend_test_log.txt")
