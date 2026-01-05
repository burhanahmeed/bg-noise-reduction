#!/bin/bash
set -e

# Install Rust
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source ~/.cargo/env
fi

# Install wasm-pack if not present
if ! command -v wasm-pack &> /dev/null; then
    cargo install wasm-pack
fi

# Build the WASM package
cd wasm
wasm-pack build --target web --out-dir ../web/pkg
cd ..

# Build the web app
cd web
npm run build