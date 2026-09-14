// claude-client.js — thin wrapper around the Anthropic Messages API, called
// directly from the browser with a key you provide yourself in Settings.
//
// Keys are session-only via CredentialVault: they survive worker suspension,
// but disappear when Chrome exits and are never included in local backups.

const ClaudeClient = {
  MODEL: "claude-haiku-4-5-20251001", // fast + cheap, right fit for short structured calls

  async getKey() {
    return CredentialVault.getSecret("hq_key_claude");
  },

  async hasKey() {
    return !!(await this.getKey());
  },

  // Returns the raw text content of Claude's reply. Throws on missing key
  // or a non-2xx response so callers can decide how to surface the failure.
  async call(systemPrompt, userPrompt, maxTokens = 1024) {
    const key = await this.getKey();
    if (!key) throw new Error("No Claude API key set — add one in Settings to enable this.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      return (data.content || []).map(b => b.text || "").join("");
    } finally {
      clearTimeout(timer);
    }
  },

  // Convenience for callers that want strict JSON back. Strips markdown
  // fences if the model wraps its answer despite instructions not to.
  // Same as call(), but allows passing Anthropic server-side tools (e.g.
  // web_search) — used by Idea Radar. Text extraction already skips
  // non-text blocks (tool_use/tool_result), so this needed no new parsing.
  async callWithTools(systemPrompt, userPrompt, tools, maxTokens = 1500) {
    const key = await this.getKey();
    if (!key) throw new Error("No Claude API key set — add one in Settings to enable this.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // web search needs more headroom than a plain call
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          tools,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      return (data.content || []).map(b => b.text || "").join("");
    } finally {
      clearTimeout(timer);
    }
  },

  async callJSON(systemPrompt, userPrompt, maxTokens = 1024) {
    const raw = await this.call(systemPrompt, userPrompt, maxTokens);
    try {
      return JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (firstErr) {
      // Self-correcting retry — a pattern real LLM-orchestration frameworks
      // (DSPy, LangChain) use for structured output: one extra call showing
      // the model its own broken output and asking it to fix the syntax,
      // rather than failing the whole feature over a stray comma. If the
      // retry ALSO fails to parse, that's a real problem worth surfacing —
      // this intentionally lets that second error propagate rather than
      // silently swallowing it.
      console.warn("callJSON: first parse failed, attempting one self-correction:", firstErr.message);
      const fixPrompt = `This is not valid JSON:\n\n${raw}\n\nReturn ONLY the corrected, valid JSON with the same content — fixed syntax only. No commentary, no markdown fences.`;
      const fixed = await this.call("You fix malformed JSON. Return only valid JSON, nothing else.", fixPrompt, maxTokens);
      return JSON.parse(fixed.replace(/```json|```/g, "").trim());
    }
  },

  // Streams the reply token-by-token via Claude's native SSE support
  // (stream: true — a real, stable Messages API feature, not a
  // third-party add-on) instead of blocking on the full response. onToken
  // is called with (chunkText, fullTextSoFar) as each piece arrives.
  // Returns the complete text once the stream ends, same shape as call().
  async callStream(systemPrompt, userPrompt, onToken, maxTokens = 1024) {
    const key = await this.getKey();
    if (!key) throw new Error("No Claude API key set — add one in Settings to enable this.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          stream: true,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // last line may be incomplete — carry it into the next chunk

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          let evt;
          try { evt = JSON.parse(jsonStr); } catch { continue; } // skip any non-JSON keepalive/comment lines
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
            onToken(evt.delta.text, fullText);
          }
        }
      }
      return fullText;
    } finally {
      clearTimeout(timer);
    }
  },
};
