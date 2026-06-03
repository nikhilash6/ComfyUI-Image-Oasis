"""
Architecture capability registry for the All-in-One Image Generation node.

Each entry declares how an architecture differs from the others: which model
source types are valid, which model-sampling patch to apply (and its defaults),
which text-conditioning path to use, and whether it can consume image inputs
(Qwen-Image-Edit). This single dict replaces every "Switch (Any)" node in the
original graph — selecting an architecture selects a row here.

To add a new architecture later, add one entry. No new branching code required.

Sampling patch values:
  - "flux"      -> ModelSamplingFlux + CONST, set_parameters(shift=shift_val)
  - "sd3"       -> ModelSamplingDiscreteFlow + CONST, multiplier=1000
  - "auraflow"  -> ModelSamplingDiscreteFlow + CONST, multiplier=1.0
  - "none"      -> no patch
"""

# Valid model source types (must match loader keys in pipeline/loaders.py)
SOURCE_CHECKPOINT = "checkpoint"
SOURCE_DIFFUSION = "diffusion"
SOURCE_GGUF = "gguf"

ALL_SOURCES = (SOURCE_CHECKPOINT, SOURCE_DIFFUSION, SOURCE_GGUF)


ARCH_REGISTRY = {
    "flux": {
        "label": "Flux",
        "loaders": ALL_SOURCES,
        "sampling": "flux",            # key consumed by apply_model_sampling()
        "shift_default": 1.15,          # Flux uses a max_shift-style value
        "accepts_image_cond": False,
        "default_clip_type": "flux",
    },
    "qwen_image_edit": {
        "label": "Qwen-Image-Edit",
        "loaders": ALL_SOURCES,         # incl. AIO checkpoints (e.g. Phr00t Rapid-AIO)
        "sampling": "auraflow",         # Qwen-Image uses AuraFlow-style discrete flow
        "shift_default": 3.0,
        "accepts_image_cond": True,     # the 1-3 image edit inputs
        "default_clip_type": "qwen_image",
    },
    "sd3": {
        "label": "SD3 / SD3.5",
        "loaders": ALL_SOURCES,
        "sampling": "sd3",
        "shift_default": 3.0,
        "accepts_image_cond": False,
        "default_clip_type": "sd3",
    },
    "auraflow": {
        "label": "AuraFlow",
        "loaders": ALL_SOURCES,
        "sampling": "auraflow",
        "shift_default": 3.0,
        "accepts_image_cond": False,
        "default_clip_type": "stable_diffusion",
    },
    "other": {
        # Escape hatch: load as-is, no sampling patch, plain CLIP encode.
        # Useful for SDXL/SD1.5 checkpoints or anything not needing a flow patch.
        "label": "Other / No patch",
        "loaders": ALL_SOURCES,
        "sampling": "none",
        "shift_default": 3.0,
        "accepts_image_cond": False,
        "default_clip_type": "stable_diffusion",
    },
}

ARCH_KEYS = list(ARCH_REGISTRY.keys())


def get_arch(name):
    spec = ARCH_REGISTRY.get(name)
    if spec is None:
        raise ValueError(
            f"[Image Oasis] Unknown architecture '{name}'. "
            f"Valid options: {', '.join(ARCH_KEYS)}"
        )
    return spec


def validate_combo(arch_name, source_type):
    """Fail loudly on an illegal architecture/source pairing before any loading."""
    spec = get_arch(arch_name)
    if source_type not in spec["loaders"]:
        valid = ", ".join(spec["loaders"])
        raise ValueError(
            f"[Image Oasis] Architecture '{arch_name}' cannot use source "
            f"type '{source_type}'. Valid sources for this architecture: {valid}."
        )
    return spec
