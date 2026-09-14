// ambient-compositor.js — adaptive procedural atmosphere for Operation HQ.
//
// The compositor is intentionally visual-only. It reads factual state from the
// Context Bus and living-widget DOM, but it never invents data or owns product
// state. WebGL runs behind the scrim, is pointer-transparent, pauses in hidden
// tabs, obeys reduced-motion, and automatically lowers resolution/frame rate
// when measured frame time says the device is struggling.

const AmbientCompositor = {
  KEY: "hq_compositor_settings_v1",
  settings: { quality: "auto", adaptive: true, enabled: true },
  canvas: null,
  gl: null,
  program: null,
  uniforms: {},
  frame: 0,
  startedAt: 0,
  lastFrameAt: 0,
  lastSampleAt: 0,
  sampleFrames: 0,
  renderedFrames: 0,
  measuredFps: 0,
  renderScale: 0.62,
  frameInterval: 1000 / 45,
  nodes: [],
  pointer: { x: 0.5, y: 0.5 },
  targetPointer: { x: 0.5, y: 0.5 },
  pulse: { value: 0, x: 0.5, y: 0.5 },
  resizeObserver: null,
  mutationObserver: null,
  initialized: false,
  lifecycleWired: false,
  preferenceWired: false,
  contextLost: false,

  vertexSource: `#version 300 es
    in vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `,

  fragmentSource: `#version 300 es
    precision highp float;
    out vec4 outColor;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform vec2 uPulseOrigin;
    uniform float uTime;
    uniform float uEnergy;
    uniform float uFocus;
    uniform float uPulse;
    uniform float uNodeCount;
    uniform vec2 uNodes[7];
    uniform float uNodeStates[7];
    uniform vec3 uAccent;
    uniform vec3 uEnvironment;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.52;
      mat2 turn = mat2(0.82, -0.57, 0.57, 0.82);
      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = turn * p * 2.03 + 8.17;
        amplitude *= 0.48;
      }
      return value;
    }

    float segment(vec2 p, vec2 a, vec2 b, float width) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
      return 1.0 - smoothstep(0.0, width, length(pa - ba * h));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      vec2 p = uv - 0.5;
      p.x *= uResolution.x / max(uResolution.y, 1.0);
      float t = uTime;
      float energy = clamp(uEnergy, 0.25, 1.35);

      vec2 drift = vec2(t * 0.018, -t * 0.011);
      float fieldA = fbm(p * 2.15 + drift + vec2(uPointer.x, uPointer.y) * 0.16);
      float fieldB = fbm(p * 3.8 - drift * 1.7 + fieldA * 0.62);
      float ribbon = exp(-abs(p.y + sin(p.x * 2.45 + t * 0.34 + fieldA * 2.1) * 0.12) * 8.8);
      float horizon = exp(-abs(p.y + 0.03) * 37.0) * (0.3 + fieldB * 0.7);
      float pointerGlow = exp(-length((uv - uPointer) * vec2(uResolution.x / uResolution.y, 1.0)) * 4.7);

      vec2 gridUv = p * vec2(15.0, 11.0);
      vec2 gridLine = abs(fract(gridUv - 0.5) - 0.5) / max(fwidth(gridUv), vec2(0.001));
      float grid = 1.0 - min(min(gridLine.x, gridLine.y), 1.0);
      grid *= smoothstep(0.92, 0.05, length(p)) * (0.12 + uFocus * 0.13);

      float network = 0.0;
      float nodeGlow = 0.0;
      vec2 core = vec2(0.5, 0.48);
      for (int i = 0; i < 7; i++) {
        if (float(i) >= uNodeCount) break;
        vec2 node = uNodes[i];
        vec2 local = (uv - node) * vec2(uResolution.x / uResolution.y, 1.0);
        float weight = 0.42 + uNodeStates[i] * 0.58;
        nodeGlow += exp(-length(local) * (18.0 - uFocus * 2.0)) * weight;
        network += segment(uv, node, core, 0.0012 + uFocus * 0.0007) * weight;
        if (i > 0) network += segment(uv, node, uNodes[i - 1], 0.00075) * 0.38;
      }

      vec2 pulseLocal = (uv - uPulseOrigin) * vec2(uResolution.x / uResolution.y, 1.0);
      float pulseRadius = (1.0 - uPulse) * 0.92;
      float pulseRing = exp(-abs(length(pulseLocal) - pulseRadius) * 64.0) * uPulse;

      float vignette = smoothstep(0.92, 0.2, length(p));
      vec3 accent = clamp(uAccent, 0.0, 1.0);
      vec3 environment = clamp(uEnvironment, 0.0, 1.0);
      vec3 colour = mix(environment, accent, 0.56 + 0.18 * sin(t * 0.08));
      colour += vec3(0.36, 0.62, 0.82) * horizon * 0.13;
      float luminance =
        fieldB * 0.075 + ribbon * 0.19 + horizon * 0.14 + pointerGlow * 0.09 +
        grid * 0.055 + network * 0.19 + nodeGlow * 0.13 + pulseRing * 0.34;
      luminance *= energy * vignette;
      float alpha = clamp(luminance * (0.58 + uFocus * 0.17), 0.0, 0.68);
      outColor = vec4(colour * luminance * 1.38, alpha);
    }
  `,

  reduced() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  profile() {
    if (this.settings.quality === "off") return { enabled: false, scale: 0, fps: 0, label: "Off" };
    if (this.reduced()) return { enabled: false, scale: 0, fps: 0, label: "Reduced motion" };
    const requested = this.settings.quality;
    const cores = Number(navigator.hardwareConcurrency || 4);
    const memory = Number(navigator.deviceMemory || 4);
    const saveData = navigator.connection?.saveData === true;
    const auto = saveData || cores <= 4 || memory <= 4 ? "efficient" : cores >= 8 && memory >= 8 ? "ultra" : "balanced";
    const quality = requested === "auto" ? auto : requested;
    return {
      enabled: true,
      scale: quality === "ultra" ? 0.86 : quality === "balanced" ? 0.64 : 0.46,
      fps: quality === "ultra" ? 60 : quality === "balanced" ? 45 : 30,
      label: `${quality[0].toUpperCase()}${quality.slice(1)}${requested === "auto" ? " · adaptive" : ""}`,
    };
  },

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const message = this.gl.getShaderInfoLog(shader) || "Unknown shader error";
      this.gl.deleteShader(shader);
      throw new Error(`Visual shader could not compile: ${message}`);
    }
    return shader;
  },

  buildProgram() {
    const vertex = this.compile(this.gl.VERTEX_SHADER, this.vertexSource);
    const fragment = this.compile(this.gl.FRAGMENT_SHADER, this.fragmentSource);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertex);
    this.gl.deleteShader(fragment);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const message = this.gl.getProgramInfoLog(program) || "Unknown WebGL link error";
      this.gl.deleteProgram(program);
      throw new Error(`Visual compositor could not link: ${message}`);
    }
    this.program = program;
    this.gl.useProgram(program);
    const position = this.gl.getAttribLocation(program, "aPosition");
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(position);
    this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);
    ["uResolution","uPointer","uPulseOrigin","uTime","uEnergy","uFocus","uPulse","uNodeCount","uNodes","uNodeStates","uAccent","uEnvironment"].forEach(name => {
      const shaderName = name === "uNodes" || name === "uNodeStates" ? `${name}[0]` : name;
      this.uniforms[name] = this.gl.getUniformLocation(program, shaderName);
    });
  },

  rgb(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parts = value.split(",").map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts.map(number => number / 255) : fallback;
  },

  resize() {
    if (!this.canvas || !this.gl) return;
    const width = Math.max(1, Math.round(innerWidth * this.renderScale));
    const height = Math.max(1, Math.round(innerHeight * this.renderScale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.syncNodes();
  },

  syncNodes() {
    this.nodes = [...document.querySelectorAll(".living-widget:not(.widget-disabled)")].slice(0, 7).map(widget => {
      const rect = widget.getBoundingClientRect();
      const state = widget.dataset.state || "idle";
      const weight = ["attention", "active", "running", "critical"].includes(state) ? 1 : ["complete", "clear"].includes(state) ? 0.52 : 0.7;
      return {
        element: widget,
        x: Math.max(0, Math.min(1, (rect.left + rect.width / 2) / Math.max(innerWidth, 1))),
        y: Math.max(0, Math.min(1, 1 - (rect.top + rect.height / 2) / Math.max(innerHeight, 1))),
        weight,
      };
    });
  },

  state() {
    const context = typeof ContextBus !== "undefined" ? ContextBus.get() : {};
    const attention = document.querySelectorAll('.living-widget[data-state="attention"],.living-widget[data-state="critical"]').length;
    const focus = context.pomodoroRunning || context.deepWork ? 1 : attention ? 0.55 : 0.18;
    const dayEnergy = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--day-energy")) || 0.75;
    return { focus, energy: Math.min(1.3, dayEnergy + Math.min(0.24, attention * 0.06)) };
  },

  applyWidgetAttitude(time) {
    if (this.reduced() || document.body.classList.contains("widget-arrange-mode")) return;
    const profile = this.profile();
    const amplitude = profile.fps >= 60 ? 2.25 : profile.fps >= 45 ? 1.45 : 0.8;
    const context = typeof ContextBus !== "undefined" ? ContextBus.get() : {};
    const focusCompression = context.pomodoroRunning || context.deepWork ? 0.58 : 1;
    this.nodes.forEach((node, index) => {
      const phase = time * 0.00042 + index * 1.73;
      const stateLift = node.weight > 0.9 ? 1.22 : 1;
      node.element.style.setProperty("--widget-drift-x", `${(Math.cos(phase * 0.71) * amplitude * 0.42 * focusCompression).toFixed(2)}px`);
      node.element.style.setProperty("--widget-drift-y", `${(Math.sin(phase) * amplitude * stateLift * focusCompression).toFixed(2)}px`);
      node.element.style.setProperty("--widget-drift-r", `${(Math.sin(phase * 0.47) * amplitude * 0.028).toFixed(3)}deg`);
    });
  },

  setUniforms(time) {
    const gl = this.gl;
    const state = this.state();
    const accent = this.rgb("--accent-rgb", [0.486, 0.361, 1]);
    const environment = this.rgb("--environment-rgb", [0.32, 0.44, 0.75]);
    this.pointer.x += (this.targetPointer.x - this.pointer.x) * 0.055;
    this.pointer.y += (this.targetPointer.y - this.pointer.y) * 0.055;
    this.pulse.value *= 0.955;
    gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.uPointer, this.pointer.x, 1 - this.pointer.y);
    gl.uniform2f(this.uniforms.uPulseOrigin, this.pulse.x, 1 - this.pulse.y);
    gl.uniform1f(this.uniforms.uTime, time * 0.001);
    gl.uniform1f(this.uniforms.uEnergy, state.energy);
    gl.uniform1f(this.uniforms.uFocus, state.focus);
    gl.uniform1f(this.uniforms.uPulse, this.pulse.value);
    gl.uniform1f(this.uniforms.uNodeCount, this.nodes.length);
    const nodeData = new Float32Array(14);
    const nodeStates = new Float32Array(7);
    this.nodes.forEach((node, index) => {
      nodeData[index * 2] = node.x;
      nodeData[index * 2 + 1] = node.y;
      nodeStates[index] = node.weight;
    });
    gl.uniform2fv(this.uniforms.uNodes, nodeData);
    gl.uniform1fv(this.uniforms.uNodeStates, nodeStates);
    gl.uniform3fv(this.uniforms.uAccent, accent);
    gl.uniform3fv(this.uniforms.uEnvironment, environment);
  },

  render(time) {
    this.frame = 0;
    if (!this.initialized || !this.gl || this.contextLost) return;
    if (document.hidden || !this.profile().enabled) return;
    this.frame = requestAnimationFrame(nextTime => this.render(nextTime));
    if (time - this.lastFrameAt < this.frameInterval) return;
    this.lastFrameAt = time;
    this.setUniforms(time - this.startedAt);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    if (this.renderedFrames % 2 === 0) this.applyWidgetAttitude(time - this.startedAt);
    this.renderedFrames += 1;
    this.sampleFrames += 1;
    if (time - this.lastSampleAt >= 3000) this.samplePerformance(time);
  },

  samplePerformance(time) {
    const elapsed = Math.max(1, time - this.lastSampleAt);
    this.measuredFps = Math.round(this.sampleFrames * 1000 / elapsed);
    this.sampleFrames = 0;
    this.lastSampleAt = time;
    const target = Math.round(1000 / this.frameInterval);
    if (this.settings.adaptive && this.settings.quality !== "off" && this.renderedFrames > 90) {
      if (this.measuredFps < target * 0.72 && this.renderScale > 0.36) {
        this.renderScale = Math.max(0.36, this.renderScale - 0.1);
        this.resize();
      } else if (this.measuredFps > target * 0.94 && this.renderScale < this.profile().scale) {
        this.renderScale = Math.min(this.profile().scale, this.renderScale + 0.04);
        this.resize();
      }
    }
    this.updateStatus();
  },

  signal(origin, strength = 1) {
    if (!this.initialized || this.reduced()) return;
    if (origin?.getBoundingClientRect) {
      const rect = origin.getBoundingClientRect();
      this.pulse.x = (rect.left + rect.width / 2) / Math.max(innerWidth, 1);
      this.pulse.y = (rect.top + rect.height / 2) / Math.max(innerHeight, 1);
    } else if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
      this.pulse.x = origin.x / Math.max(innerWidth, 1);
      this.pulse.y = origin.y / Math.max(innerHeight, 1);
    }
    this.pulse.value = Math.min(1, Math.max(this.pulse.value, Number(strength) || 0.8));
  },

  transition(kind = "theme") {
    const strength = { lockdown: 1, deepwork: 0.92, privacy: 0.72, zen: 0.82, professional: 0.78, theme: 0.75 }[kind] || 0.7;
    this.signal({ x: innerWidth / 2, y: innerHeight / 2 }, strength);
    this.canvas?.classList.remove("compositor-transition");
    void this.canvas?.offsetWidth;
    this.canvas?.classList.add("compositor-transition");
  },

  updateStatus(message = "") {
    const status = document.getElementById("compositor-status");
    if (!status) return;
    const profile = this.profile();
    if (!profile.enabled) status.textContent = `Procedural atmosphere: ${profile.label}. State changes still keep their non-motion cues.`;
    else if (!this.gl) status.textContent = "Procedural atmosphere unavailable; the CSS motion layer remains active.";
    else status.textContent = message || `Procedural atmosphere: ${profile.label} · ${this.canvas.width}×${this.canvas.height}${this.measuredFps ? ` · measured ${this.measuredFps} fps` : " · measuring performance"}.`;
  },

  applyProfile() {
    const profile = this.profile();
    this.renderScale = profile.scale || 0.5;
    this.frameInterval = profile.fps ? 1000 / profile.fps : 1000;
    document.body.dataset.compositor = profile.enabled && this.gl ? "active" : "off";
    if (this.canvas) this.canvas.hidden = !profile.enabled || !this.gl;
    if (!profile.enabled) {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.nodes.forEach(node => ["--widget-drift-x", "--widget-drift-y", "--widget-drift-r"].forEach(name => node.element.style.removeProperty(name)));
    } else if (this.initialized && this.gl && this.startedAt && !this.frame && !document.hidden) {
      this.frame = requestAnimationFrame(time => this.render(time));
    }
    this.resize();
    this.updateStatus();
  },

  bindSettings() {
    const quality = document.getElementById("compositor-quality-select");
    const adaptive = document.getElementById("compositor-adaptive-toggle");
    const preview = document.getElementById("compositor-preview");
    if (!quality || !adaptive || !preview) return;
    quality.value = this.settings.quality;
    adaptive.checked = this.settings.adaptive;
    quality.onchange = async event => {
      this.settings.quality = event.target.value;
      this.settings.enabled = this.settings.quality !== "off";
      await chrome.storage.local.set({ [this.KEY]: this.settings });
      if (this.settings.enabled && !this.gl && !this.reduced()) await this.startRenderer();
      else this.applyProfile();
    };
    adaptive.onchange = async event => {
      this.settings.adaptive = event.target.checked;
      await chrome.storage.local.set({ [this.KEY]: this.settings });
      this.applyProfile();
    };
    preview.onclick = () => {
      this.signal({ x: innerWidth / 2, y: innerHeight / 2 }, 1);
      this.canvas?.classList.remove("compositor-preview");
      void this.canvas?.offsetWidth;
      this.canvas?.classList.add("compositor-preview");
    };

    if (!this.preferenceWired) {
      this.preferenceWired = true;
      const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
      motionPreference.addEventListener?.("change", async event => {
        if (!event.matches && this.settings.quality !== "off" && !this.gl) await this.startRenderer();
        else this.applyProfile();
      });
    }
  },

  wireLifecycle() {
    if (this.lifecycleWired) return;
    this.lifecycleWired = true;
    addEventListener("resize", () => this.resize(), { passive: true });
    addEventListener("pointermove", event => {
      this.targetPointer.x = event.clientX / Math.max(innerWidth, 1);
      this.targetPointer.y = event.clientY / Math.max(innerHeight, 1);
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.lastFrameAt = performance.now();
        this.lastSampleAt = performance.now();
        this.sampleFrames = 0;
        if (this.profile().enabled && !this.frame) this.frame = requestAnimationFrame(time => this.render(time));
      } else if (this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    });
    this.canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      this.contextLost = true;
      this.canvas.hidden = true;
      this.updateStatus("Procedural atmosphere paused after the graphics context was lost; the dashboard remains fully usable.");
    });
    this.canvas.addEventListener("webglcontextrestored", () => location.reload());
    this.resizeObserver = new ResizeObserver(() => this.syncNodes());
    document.querySelectorAll(".living-widget").forEach(widget => this.resizeObserver.observe(widget));
    this.mutationObserver = new MutationObserver(() => this.syncNodes());
    const canvas = document.getElementById("widget-canvas");
    if (canvas) this.mutationObserver.observe(canvas, { subtree: true, attributes: true, attributeFilter: ["data-state", "data-slot", "class"] });
    if (typeof ContextBus !== "undefined") ContextBus.onChange(() => this.signal({ x: innerWidth / 2, y: innerHeight / 2 }, 0.42));
  },

  async startRenderer() {
    if (this.gl) { this.applyProfile(); return true; }
    try {
      this.contextLost = false;
      this.gl = this.canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance", premultipliedAlpha: true });
      if (!this.gl) throw new Error("WebGL 2 is unavailable");
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
      this.buildProgram();
      this.initialized = true;
      this.startedAt = performance.now();
      this.lastFrameAt = this.startedAt;
      this.lastSampleAt = this.startedAt;
      this.wireLifecycle();
      this.applyProfile();
      return true;
    } catch (error) {
      this.gl = null;
      this.initialized = true;
      this.canvas.hidden = true;
      this.updateStatus(`Procedural atmosphere unavailable (${error.message}); the CSS motion layer remains active.`);
      window.HQEarlyDiagnostics?.record("visual-compositor", error.message);
      return false;
    }
  },

  async init() {
    if (this.initialized) return true;
    this.canvas = document.getElementById("hq-compositor-canvas");
    if (!this.canvas) return false;
    const saved = await chrome.storage.local.get(this.KEY);
    const stored = saved[this.KEY];
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      this.settings = {
        quality: ["auto", "ultra", "balanced", "efficient", "off"].includes(stored.quality) ? stored.quality : "auto",
        adaptive: stored.adaptive !== false,
        enabled: stored.quality !== "off",
      };
    }
    this.bindSettings();
    this.initialized = true;
    if (this.reduced() || this.settings.quality === "off") {
      this.applyProfile();
      return true;
    }
    return this.startRenderer();
  },
};
