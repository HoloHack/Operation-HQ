// webllm-loader.mjs — the ONLY ES module in this codebase, and it exists
// for one narrow reason: @mlc-ai/web-llm ships as a real ES module
// (package.json "type": "module", top-level `export {...}`), and every
// other file here is a classic script sharing one global scope with no
// bundler. This file is the bridge: it's loaded via
// <script type="module" src="js/lib/webllm/webllm-loader.mjs">, imports
// the named exports it actually needs, and attaches them to
// window.WebLLM so local-ai.js (a normal classic script, like everything
// else) can use `WebLLM.CreateMLCEngine(...)` directly.
//
// Module scripts execute after the DOM is parsed but their timing
// relative to classic <script> tags isn't something other files should
// have to reason about, so this dispatches a "webllm-ready" event on
// window once the bridge is actually in place. local-ai.js waits for
// that (or checks if it already fired) before touching WebLLM.

import { CreateMLCEngine, prebuiltAppConfig, hasModelInCache } from "./web-llm.js";

window.WebLLM = { CreateMLCEngine, prebuiltAppConfig, hasModelInCache };
window.dispatchEvent(new Event("webllm-ready"));
