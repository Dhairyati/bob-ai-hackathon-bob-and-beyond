import subprocess
import sys
import os
import threading
import time

def stream_output(pipe, prefix):
    with pipe:
        for line in iter(pipe.readline, ''):
            if line:
                print(f"{prefix} {line}", end='')

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_env = os.environ.copy()
    backend_env["PYTHONUNBUFFERED"] = "1"
    
    # Path to the virtual environment python
    python_exe = os.path.join(root_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        print(f"Error: Virtual environment python not found at {python_exe}")
        print("Please ensure the backend has been set up properly.")
        sys.exit(1)
        
    print("🚀 Starting Backend (FastAPI)...")
    backend_proc = subprocess.Popen(
        [python_exe, "-m", "uvicorn", "backend.main:app", "--reload", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=root_dir,
        env=backend_env
    )
    
    print("🚀 Starting Frontend (Vite)...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_dir = os.path.join(root_dir, "frontend")
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=frontend_dir
    )
    
    # Create threads to stream output to the console with prefixes
    threading.Thread(target=stream_output, args=(backend_proc.stdout, "[BACKEND] "), daemon=True).start()
    threading.Thread(target=stream_output, args=(frontend_proc.stdout, "[FRONTEND]"), daemon=True).start()
    
    try:
        # Keep the main thread alive until the user hits Ctrl+C
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print("❌ Backend stopped unexpectedly.")
                break
            if frontend_proc.poll() is not None:
                print("❌ Frontend stopped unexpectedly.")
                break
    except KeyboardInterrupt:
        print("\n🛑 Stopping both servers...")
    finally:
        try:
            backend_proc.terminate()
            frontend_proc.terminate()
        except:
            pass
        backend_proc.wait()
        frontend_proc.wait()
        print("✅ Servers completely stopped.")

if __name__ == "__main__":
    main()
