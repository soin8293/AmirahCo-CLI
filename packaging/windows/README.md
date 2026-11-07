# Windows package

The reviewed native Windows x64 EXE and ZIP are staged as release assets, not Git blobs. The public candidate manifest records their exact hashes. Source builds use Node.js 22+ and Bun; no WSL is required for the Windows app.

The existing installer verifies its payload and per-file manifest, installs side by side per user, then updates Desktop/Start-menu shortcuts using the approved emerald icon. Native Node, Python and Git runtimes are bundled in the installer with their own notices. Profiles/projects live outside replaced binaries.

The update channel is deliberately inactive in this candidate. Do not add a production signing secret to Git or enable a feed by copying private machine settings. Complete the existing versioned package recipe and independent Windows receiving checks before publishing a successor.
