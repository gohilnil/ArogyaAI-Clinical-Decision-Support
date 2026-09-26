"""Single source of truth for the loaded ML artifact.

The pickle is loaded exactly once, here. Every other module imports these
objects, so a patch applied to `model` (e.g. `patch.object(model, "predict_proba")`)
affects the real call site — which is what the existing test suite relies on.
"""
import joblib

from backend.core.config import MODEL_PATH

model_components = None
model = None
scaler = None
vectorizer = None
encoders = None
training_feature_columns = None


def _load():
    """Load the persisted model bundle, mirroring the original startup messages."""
    try:
        components = joblib.load(MODEL_PATH)
        print("[OK] ML Model loaded successfully.")
        return components
    except FileNotFoundError:
        print(f"[ERROR] Model file not found at '{MODEL_PATH}'.")
        print("Please run 'python train_model.py' to train and save the model first.")
        raise SystemExit()
    except KeyError:
        print(
            f"[ERROR] The model file '{MODEL_PATH}' is missing required components "
            "like 'feature_columns'."
        )
        print("Please re-run 'python train_model.py' to ensure the model is saved correctly.")
        raise SystemExit()


model_components = _load()
model = model_components["model"]
scaler = model_components["scaler"]
vectorizer = model_components["vectorizer"]
encoders = model_components["encoders"]
training_feature_columns = model_components["feature_columns"]
