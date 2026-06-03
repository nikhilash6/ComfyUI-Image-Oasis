"""
Image Oasis — standalone all-in-one ComfyUI image generation node.

Composes loading, architecture-specific sampling, conditioning (text or
Qwen-Image-Edit), a KSampler refinement chain, and optional upscale into one
node.
"""

import os
import sys
import importlib.util

# Load nodes.py by absolute file path rather than a relative import.
# ComfyUI may assign this package a module name equal to its filesystem path,
# which makes `from .nodes import ...` resolve incorrectly. Loading by path is
# immune to whatever __name__ ComfyUI assigns.

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def _load(mod_name):
    key = f"image_oasis_{mod_name}"
    if key in sys.modules:
        return sys.modules[key]
    path = os.path.join(_THIS_DIR, f"{mod_name}.py")
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return module


_nodes = _load("nodes")

# Import the HTTP route modules so their @routes decorators register on load.
# Wrapped so a route failure never blocks the node itself from loading.
try:
    _load("routes")
except Exception as _e:
    print(f"[Image Oasis] route registration skipped: {_e}")
try:
    _load("routes_enhance")
except Exception as _e:
    print(f"[Image Oasis] enhancer route registration skipped: {_e}")

NODE_CLASS_MAPPINGS = _nodes.NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = _nodes.NODE_DISPLAY_NAME_MAPPINGS

# Tell ComfyUI where the frontend JS lives.
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
