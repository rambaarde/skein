#!/usr/bin/env node
// The CLI must never open a TUI when piped, and never prompt (AXI 6).
import { main } from '../src/main.js'
await main()
