#!/usr/bin/env bash
# Ensure correct Node version
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 20.10.0

(cd jil_inventory_backend && ./start.sh) & 
npm start
