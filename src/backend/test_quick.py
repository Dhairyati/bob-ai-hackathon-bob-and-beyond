"""Quick test to isolate backend startup issues."""
import sys
import os

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if os.path.dirname(__file__) else '.')

print("Step 1: Python version:", sys.version)
print("Step 2: Testing imports...")

try:
    from dotenv import load_dotenv
    print("  ✓ python-dotenv")
except ImportError as e:
    print(f"  ✗ python-dotenv: {e}")

try:
    import tensorflow as tf
    print(f"  ✓ tensorflow {tf.__version__}")
except ImportError as e:
    print(f"  ✗ tensorflow: {e}")

try:
    import keras
    print(f"  ✓ keras {keras.__version__}")
except ImportError as e:
    print(f"  ✗ keras: {e}")

try:
    print("Step 3: Testing tf.keras.layers.Layer...")
    layer = tf.keras.layers.Layer
    print(f"  ✓ tf.keras.layers.Layer accessible")
except Exception as e:
    print(f"  ✗ tf.keras.layers.Layer: {e}")

try:
    print("Step 4: Testing custom_layers import...")
    from backend.custom_layers import CUSTOM_OBJECTS
    print(f"  ✓ CUSTOM_OBJECTS: {list(CUSTOM_OBJECTS.keys())}")
except Exception as e:
    print(f"  ✗ custom_layers: {e}")
    import traceback
    traceback.print_exc()

try:
    print("Step 5: Testing config import...")
    from backend.config import CORS_ORIGINS, MODELS_DIR, DATA_DIR
    print(f"  ✓ MODELS_DIR: {MODELS_DIR}")
    print(f"  ✓ DATA_DIR: {DATA_DIR}")
except Exception as e:
    print(f"  ✗ config: {e}")
    import traceback
    traceback.print_exc()

try:
    print("Step 6: Testing model_loader import...")
    from backend import model_loader
    print(f"  ✓ model_loader imported")
except Exception as e:
    print(f"  ✗ model_loader: {e}")
    import traceback
    traceback.print_exc()

print("\nStep 7: Testing model loading...")
try:
    model_loader.load_all()
    print(f"  ✓ Models loaded: {len(model_loader.models)}")
except Exception as e:
    print(f"  ✗ Model loading failed: {e}")
    import traceback
    traceback.print_exc()

print("\n✅ Diagnostic complete!")
