import sys
import os

print("=" * 50)
print("DIAGNOSTIC REPORT")
print("=" * 50)
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"CWD: {os.getcwd()}")
print()

# Check if models exist
models_dir = r"C:\Users\Mtl\Downloads\RUL Dashboard"
data_dir = r"C:\Users\Mtl\Downloads\RUL\CMAPSS"

print("=== Model Files ===")
for f in ["rul_best_model.keras", "snapshot_0.keras", "config.pkl", "feature_scaler.pkl", "condition_scalers.pkl", "kmeans_op_conditions.pkl"]:
    path = os.path.join(models_dir, f)
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    print(f"  {f}: {'OK' if exists else 'MISSING'} ({size:,} bytes)")

print()
print("=== Data Files ===")
if os.path.exists(data_dir):
    for f in os.listdir(data_dir):
        path = os.path.join(data_dir, f)
        print(f"  {f}: {os.path.getsize(path):,} bytes")
else:
    print(f"  DATA_DIR not found: {data_dir}")

print()
print("=== Package Check ===")
packages = [
    "tensorflow", "fastapi", "uvicorn", "sklearn", "pandas", 
    "numpy", "joblib", "dotenv"
]
for pkg in packages:
    try:
        mod = __import__(pkg)
        ver = getattr(mod, "__version__", "unknown")
        print(f"  {pkg}: {ver}")
    except ImportError as e:
        print(f"  {pkg}: MISSING ({e})")

print()
print("=== Import Test ===")
try:
    sys.path.insert(0, os.path.join(models_dir, "backend"))
    from config import DATA_DIR, MODELS_DIR
    print(f"  config.py: OK (DATA_DIR={DATA_DIR}, MODELS_DIR={MODELS_DIR})")
except Exception as e:
    print(f"  config.py: FAILED ({e})")

try:
    from custom_layers import CUSTOM_OBJECTS
    print(f"  custom_layers.py: OK (keys={list(CUSTOM_OBJECTS.keys())})")
except Exception as e:
    print(f"  custom_layers.py: FAILED ({e})")

print()
print("DONE")
