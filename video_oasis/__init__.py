"""Video Oasis Viewer — preview / encode / scene-bar player (subpackage)."""

from .preview_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

try:
    from . import routes_viewer  # noqa: F401
except Exception as _e:
    print(f"[Video Oasis] viewer routes not registered: {_e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
