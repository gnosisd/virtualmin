# Barehands Experience Edition v1

Built on the pinned upstream Barehands stage (`jaredrhod/barehands` commit `0a097be1d95069f6121326e05985fc1418e9189f`).

## Design rule

The original Barehands gesture engine is not patched. Experience Edition adds functionality and presentation effects around it.

## Added

- Cinematic ambient particle field and holographic floor grid
- Portal/materialization effects for new cards, panels and models
- Energy trails while native Barehands objects are being moved
- Toggleable cinematic glass effects
- Preset Showcase, Document Wall and Network Visualization scenes
- 3D model staging using Barehands' native model card + hologram/solid render modes
- PDF, DOCX, XLS/XLSX/CSV, PPTX, TXT/MD/JSON/XML conversion into native spatial note panels
- Image/video local staging
- IndexedDB-backed local imported-file library

## 3D demo objects

The demo uses public sample assets from Three.js and Khronos glTF Sample Assets. They are loaded remotely rather than redistributed here.

## Source layout

`experience-parts/part1.txt` through `part5.txt` concatenate to the injected Experience Edition browser addon.

The deployment stage fetches the pinned original Barehands `stage.html`, concatenates these parts, and injects the Experience layer before Barehands boot. No pinch/clap/claw/throw/scale gesture thresholds or gesture handlers are replaced.
