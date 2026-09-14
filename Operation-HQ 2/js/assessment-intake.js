// assessment-intake.js — local-first assessment file detection and planning.
// Download history is optional and exposes metadata only. File contents are
// read only after a direct import or a user-granted File System Access handle.

const AssessmentIntake = {
  KEY: "hq_assessment_intake_v1",
  SETTINGS_KEY: "hq_assessment_intake_settings_v1",
  DOWNLOAD_EVENTS_KEY: "hq_assessment_download_events_v1",
  DB_NAME: "operation-hq-file-handles",
  HANDLE_KEY: "assessment-downloads-folder",
  items: [],
  settings: { autoScan: true, onlyLikely: true },
  volatileText: new Map(),
  initialized: false,
  booted: false,

  status(message) {
    const target = document.getElementById("assessment-intake-status");
    if (target) target.textContent = message;
  },

  basename(value) {
    return String(value || "").split(/[\\/]/).pop() || "Downloaded file";
  },

  extension(name) {
    return this.basename(name).toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  },

  isSupported(name) {
    return [".pdf", ".docx", ".txt", ".md", ".html", ".htm", ".rtf"].includes(this.extension(name));
  },

  looksRelevant(name, text = "") {
    const value = `${name} ${String(text).slice(0, 2500)}`.toLowerCase().replace(/[_-]+/g, " ");
    return /\b(assessment|assignment|task\s*\d|at\s*\d|exam|test|project|rubric|notification|scope|practical|portfolio|research|presentation|multimodal|due\s+date|submission)\b/.test(value);
  },

  cleanFilename(name) {
    return this.basename(name)
      .replace(/\.(pdf|docx|txt|md|html?|rtf)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  },

  localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  validDate(year, month, day) {
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  },

  dateFromParts(day, month, year) {
    let fullYear = Number(year);
    if (!year) fullYear = new Date().getFullYear();
    if (fullYear < 100) fullYear += fullYear < 70 ? 2000 : 1900;
    let date = this.validDate(fullYear, Number(month), Number(day));
    if (!date) return null;
    const floor = new Date(); floor.setHours(0, 0, 0, 0);
    if (!year && date < new Date(floor.getTime() - 120 * 86400000)) date = this.validDate(fullYear + 1, Number(month), Number(day));
    return date;
  },

  extractDates(text) {
    const source = String(text || "").replace(/\s+/g, " ");
    const months = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
    const contextPattern = /\b(?:due|deadline|submission|submit|upload|assessment date|test date|exam date|scheduled for|complete by|hand in)(?:\s+(?:date|is|on|by|at|before))?\s*[:–-]?\s*([^.;|]{3,58})/gi;
    const candidates = [];
    for (const context of source.matchAll(contextPattern)) {
      let evidence = context[0].trim().slice(0, 100);
      const value = context[1];
      let date = null;
      let match = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
      if (match) date = this.dateFromParts(match[3], match[2], match[1]);
      if (!date) {
        match = value.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
        if (match) date = this.dateFromParts(match[1], match[2], match[3]);
      }
      if (!date) {
        match = value.match(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)?\s*,?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?/i);
        if (match) date = this.dateFromParts(match[1], months[match[2].toLowerCase()], match[3]);
      }
      if (!date) {
        match = value.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/i);
        if (match) date = this.dateFromParts(match[2], months[match[1].toLowerCase()], match[3]);
      }
      if (date) {
        const clipped = evidence.match(/^.{0,78}?(?:20\d{2}|\d{1,2}(?:st|nd|rd|th)?)(?=\s+(?:you|students?|candidates?)\b|[.;|]|$)/i)?.[0];
        if (clipped) evidence = clipped;
        candidates.push({ dateKey: this.localDateKey(date), evidence });
      }
    }
    return candidates.filter((item, index, all) => all.findIndex(entry => entry.dateKey === item.dateKey) === index);
  },

  inferSubject(name, text) {
    const value = `${name} ${String(text).slice(0, 5000)}`.toLowerCase();
    const subjects = [
      ["Mathematics", /\b(math(?:s|ematics)?|algebra|quadratic|geometry|trigonometry|indices)\b/],
      ["English", /\b(english|essay|poetry|shakespeare|creative writing|multimodal)\b/],
      ["Science", /\b(science|biology|chemistry|physics|experiment|scientific report)\b/],
      ["HSIE", /\b(hsie|history|geography|civics|rights and freedoms)\b/],
      ["Computing", /\b(computing|software|programming|coding|technology|database)\b/],
      ["Commerce", /\b(commerce|business|economics|marketing|consumer)\b/],
      ["PDHPE", /\b(pdhpe|health|physical education|sport science)\b/],
      ["Creative Arts", /\b(visual arts|music|drama|design portfolio)\b/],
    ];
    return subjects.find(([, pattern]) => pattern.test(value))?.[0] || "Unclassified";
  },

  inferType(name, text) {
    const value = `${name} ${String(text).slice(0, 7000)}`.toLowerCase();
    if (/\b(exam|in-class test|test notification)\b/.test(value)) return "exam";
    if (/\b(multimodal|presentation|speech|slides)\b/.test(value)) return "presentation";
    if (/\b(essay|report|extended response)\b/.test(value)) return "writing";
    if (/\b(practical|prototype|build|experiment|portfolio)\b/.test(value)) return "practical";
    if (/\b(research|investigation|case study)\b/.test(value)) return "research";
    return "assignment";
  },

  usefulLines(text) {
    return String(text || "").replace(/\r/g, "\n").split(/\n+/).map(line => line.replace(/^\s*[•●▪◦*-]\s*/, "").replace(/\s+/g, " ").trim()).filter(line => line.length >= 12 && line.length <= 260);
  },

  inferTitle(name, lines) {
    const strong = lines.find(line => /\b(assessment|assignment|task|project|exam|test|investigation|portfolio)\b/i.test(line) && line.length <= 120);
    return (strong || this.cleanFilename(name) || "Assessment awaiting review").slice(0, 120);
  },

  inferDescription(lines) {
    const lead = lines.findIndex(line => /\b(task description|task outline|you are required|your task|task overview|assessment description)\b/i.test(line));
    const pool = lead >= 0 ? lines.slice(lead, lead + 4) : lines.filter(line => /\b(create|compose|write|design|investigate|analyse|evaluate|present|complete|demonstrate|respond)\b/i.test(line)).slice(0, 3);
    return pool.join(" ").slice(0, 700) || "The document was detected, but its task description still needs your review.";
  },

  inferRequirements(lines) {
    const results = lines.filter(line => /\b(must|required|include|submit|upload|word(?:s| count)?|minute|source|criterion|criteria|mark|rubric|format|section|part [a-z0-9])\b/i.test(line));
    return results.filter((line, index) => results.findIndex(value => value.toLowerCase() === line.toLowerCase()) === index).slice(0, 8);
  },

  makeSteps(type, title, requirements) {
    const steps = [{ label: "Read the brief and mark every deliverable", minutes: 25, phase: "Decode" }];
    if (["writing", "research", "presentation"].includes(type)) steps.push({ label: "Collect evidence and organise source notes", minutes: 50, phase: "Evidence" });
    if (type === "exam") steps.push({ label: "Map the assessed topics and identify weak areas", minutes: 40, phase: "Diagnose" });
    if (type === "practical") steps.push({ label: "Plan materials, method and success checks", minutes: 40, phase: "Plan" });
    if (type === "presentation") steps.push({ label: "Build the argument and slide sequence", minutes: 60, phase: "Structure" });
    else if (type === "writing") steps.push({ label: "Build the thesis, structure and paragraph evidence", minutes: 60, phase: "Structure" });
    else if (type === "research") steps.push({ label: "Synthesize findings into a defensible structure", minutes: 60, phase: "Structure" });
    else if (type === "exam") steps.push({ label: "Complete timed practice and log every error", minutes: 75, phase: "Practice" });
    else if (type === "practical") steps.push({ label: `Build and document ${title.slice(0, 54)}`, minutes: 90, phase: "Build" });
    else steps.push({ label: "Break the deliverables into a first complete draft", minutes: 60, phase: "Build" });
    if (requirements.length) steps.push({ label: "Check every stated requirement against the work", minutes: 30, phase: "Rubric" });
    steps.push({ label: "Revise the weakest section and quality-check the final", minutes: 40, phase: "Refine" });
    steps.push({ label: "Prepare the correct file and complete submission checks", minutes: 20, phase: "Submit" });
    return steps.map((step, index) => ({ id: `step-${index + 1}`, ...step }));
  },

  analyze(name, text = "", source = "metadata") {
    const lines = this.usefulLines(text);
    const dates = this.extractDates(`${name}\n${text}`);
    const title = this.inferTitle(name, lines);
    const subject = this.inferSubject(name, text);
    const type = this.inferType(name, text);
    const requirements = this.inferRequirements(lines);
    const description = source === "metadata" ? "Filename detected from download history. Grant folder access or import the file to extract its actual description." : this.inferDescription(lines);
    const steps = this.makeSteps(type, title, requirements);
    const score = Number(!!dates.length) + Number(subject !== "Unclassified") + Number(requirements.length >= 2) + Number(source !== "metadata");
    return {
      title, subject, type, description, requirements, steps,
      dueDate: dates[0]?.dateKey || "",
      dueEvidence: dates[0]?.evidence || "No explicit deadline found",
      alternateDates: dates.slice(1),
      confidence: score >= 4 ? "high" : score >= 2 ? "medium" : "review",
      estimatedMinutes: steps.reduce((sum, step) => sum + step.minutes, 0),
    };
  },

  async decompress(bytes, format) {
    if (typeof DecompressionStream === "undefined") throw new Error("This Chrome build cannot decompress that document locally.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  },

  async readDocx(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let index = Math.max(0, bytes.length - 65557); index <= bytes.length - 22; index += 1) {
      if (view.getUint32(index, true) === 0x06054b50) eocd = index;
    }
    if (eocd < 0) throw new Error("The DOCX container is incomplete.");
    const centralOffset = view.getUint32(eocd + 16, true);
    let cursor = centralOffset;
    let target = null;
    while (cursor + 46 <= bytes.length && view.getUint32(cursor, true) === 0x02014b50) {
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      if (name === "word/document.xml") target = { method, compressedSize, localOffset };
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (!target) throw new Error("No Word document body was found.");
    const nameLength = view.getUint16(target.localOffset + 26, true);
    const extraLength = view.getUint16(target.localOffset + 28, true);
    const start = target.localOffset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + target.compressedSize);
    const body = target.method === 0 ? compressed : target.method === 8 ? await this.decompress(compressed, "deflate-raw") : null;
    if (!body) throw new Error("That DOCX compression method is not supported.");
    const xml = new TextDecoder().decode(body);
    const documentXml = new DOMParser().parseFromString(xml, "application/xml");
    return [...documentXml.getElementsByTagName("w:p")].map(node => node.textContent.trim()).filter(Boolean).join("\n");
  },

  decodePdfString(value) {
    return value.replace(/\\([nrtbf()\\])/g, (_, char) => ({ n:"\n",r:"\r",t:"\t",b:"",f:"", "(":"(", ")":")", "\\":"\\" })[char] ?? char)
      .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  },

  pdfOperators(source) {
    const blocks = [...String(source).matchAll(/BT([\s\S]*?)ET/g)].map(match => match[1]);
    const text = [];
    blocks.forEach(block => {
      for (const match of block.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g)) text.push(this.decodePdfString(match[1]));
      for (const array of block.matchAll(/\[((?:[^\]]|\][^TJ])*)\]\s*TJ/g)) {
        for (const match of array[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) text.push(this.decodePdfString(match[1]));
      }
    });
    return text.join(" ");
  },

  async readPdf(file) {
    if (file.size > 18 * 1024 * 1024) throw new Error("PDF is above the 18 MB local intake limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const latin = new TextDecoder("latin1").decode(bytes);
    const pieces = [this.pdfOperators(latin)];
    let cursor = 0;
    while ((cursor = latin.indexOf("stream", cursor)) >= 0 && pieces.length < 80) {
      const lineEnd = latin.indexOf("\n", cursor);
      const end = latin.indexOf("endstream", lineEnd);
      if (lineEnd < 0 || end < 0) break;
      const dictionary = latin.slice(Math.max(0, cursor - 500), cursor);
      if (/\/FlateDecode/.test(dictionary)) {
        try {
          let streamBytes = bytes.slice(lineEnd + 1, end);
          while (streamBytes.length && [10, 13].includes(streamBytes[streamBytes.length - 1])) streamBytes = streamBytes.slice(0, -1);
          const inflated = await this.decompress(streamBytes, "deflate");
          pieces.push(this.pdfOperators(new TextDecoder("latin1").decode(inflated)));
        } catch { /* malformed or unsupported PDF stream; continue safely */ }
      }
      cursor = end + 9;
    }
    const text = pieces.join("\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 80) throw new Error("This PDF uses an image or font encoding the built-in reader cannot reliably extract. Import a text/DOCX version or paste the brief into Native AI.");
    return text;
  },

  async readFile(file) {
    if (!this.isSupported(file.name)) throw new Error("Supported formats are PDF, DOCX, TXT, MD, HTML and RTF.");
    if (file.size > 18 * 1024 * 1024) throw new Error("File is above the 18 MB local intake limit.");
    const ext = this.extension(file.name);
    if (ext === ".docx") return this.readDocx(file);
    if (ext === ".pdf") return this.readPdf(file);
    let text = await file.text();
    if ([".html", ".htm"].includes(ext)) text = new DOMParser().parseFromString(text, "text/html").body?.innerText || "";
    if (ext === ".rtf") text = text.replace(/\\par[d]?\b/g, "\n").replace(/\\'[0-9a-f]{2}/gi, " ").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "");
    return text.slice(0, 160000);
  },

  async load() {
    const saved = await chrome.storage.local.get([this.KEY, this.SETTINGS_KEY]);
    this.items = Array.isArray(saved[this.KEY]) ? saved[this.KEY].filter(item => item?.id && item?.fingerprint && item?.analysis) : [];
    this.settings = { ...this.settings, ...(saved[this.SETTINGS_KEY] || {}) };
  },

  async save() {
    await chrome.storage.local.set({ [this.KEY]: this.items.slice(0, 80), [this.SETTINGS_KEY]: this.settings });
    this.render();
  },

  async addFile(file, origin = "import") {
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    // Download history can only identify a file by Chrome's download ID. Once
    // the user grants or imports the real file, upgrade the pending metadata
    // card instead of creating a second card for the same basename.
    const metadataMatch = this.items.find(item => item.state === "pending" && !item.sourceRead && item.filename.toLowerCase() === this.basename(file.name).toLowerCase());
    const existing = this.items.find(item => item.fingerprint === fingerprint) || metadataMatch;
    if (existing?.sourceRead) return { state: "duplicate", item: existing };
    const text = await this.readFile(file);
    if (this.settings.onlyLikely && origin === "folder" && !this.looksRelevant(file.name, text)) return { state: "ignored" };
    const analysis = this.analyze(file.name, text, origin);
    const item = existing || { id: crypto.randomUUID(), detectedAt: Date.now(), state: "pending" };
    const oldFingerprint = item.fingerprint;
    Object.assign(item, { fingerprint, filename: this.basename(file.name), source: origin, sourceRead: true, size: file.size, modifiedAt: file.lastModified, analysis, readNote: "Derived details stored locally; full source text is not retained." });
    if (oldFingerprint && oldFingerprint !== fingerprint) this.volatileText.delete(oldFingerprint);
    this.volatileText.set(fingerprint, text.slice(0, 12000));
    if (!existing) this.items.unshift(item);
    await this.save();
    return { state: "added", item };
  },

  async importFiles(files) {
    const selected = [...files].filter(file => this.isSupported(file.name));
    if (!selected.length) return this.status("Choose a PDF, DOCX, TXT, MD, HTML or RTF assessment file.");
    this.status(`Reading ${selected.length} file${selected.length === 1 ? "" : "s"} locally…`);
    let added = 0, failed = 0;
    for (const file of selected.slice(0, 20)) {
      try { if ((await this.addFile(file, "import")).state === "added") added += 1; }
      catch (error) { failed += 1; this.status(`${this.basename(file.name)} needs review: ${error.message}`); }
    }
    if (!failed) this.status(`${added} assessment file${added === 1 ? "" : "s"} analysed locally. Review every extracted field before accepting.`);
  },

  openHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async setFolderHandle(handle) {
    const db = await this.openHandleDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("handles", "readwrite").objectStore("handles").put(handle, this.HANDLE_KEY);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
  },

  async forgetFolder() {
    const db = await this.openHandleDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("handles", "readwrite").objectStore("handles").delete(this.HANDLE_KEY);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
    await this.renderPermission();
    this.status("Saved folder access was forgotten. Existing derived assessment cards were preserved.");
  },

  async getFolderHandle() {
    try {
      const db = await this.openHandleDb();
      const handle = await new Promise((resolve, reject) => {
        const request = db.transaction("handles", "readonly").objectStore("handles").get(this.HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle;
    } catch { return null; }
  },

  async connectFolder() {
    if (typeof window.showDirectoryPicker !== "function") return this.status("Folder access is unavailable in this browser. Direct file import still works.");
    try {
      const handle = await window.showDirectoryPicker({ id: "operation-hq-assessments", mode: "read", startIn: "downloads" });
      await this.setFolderHandle(handle);
      this.status(`“${handle.name}” granted for local assessment scanning. No file leaves this device.`);
      await this.scanFolder(handle, false);
      await this.renderPermission();
    } catch (error) {
      if (error.name !== "AbortError") this.status(`Folder access stopped safely: ${error.message}`);
    }
  },

  async scanFolder(suppliedHandle = null, automatic = false) {
    const handle = suppliedHandle || await this.getFolderHandle();
    if (!handle) {
      if (!automatic) this.status("Grant your Downloads folder first, or import selected files directly.");
      return;
    }
    let permission = await handle.queryPermission({ mode: "read" });
    if (permission !== "granted" && !automatic) permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      this.status("Folder permission is not active. Click Grant Downloads folder to restore it.");
      return;
    }
    const candidates = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== "file" || !this.isSupported(entry.name)) continue;
      const file = await entry.getFile();
      if (Date.now() - file.lastModified > 90 * 86400000) continue;
      candidates.push(file);
    }
    candidates.sort((a, b) => b.lastModified - a.lastModified);
    let added = 0, failed = 0;
    for (const file of candidates.slice(0, 24)) {
      try { if ((await this.addFile(file, "folder")).state === "added") added += 1; }
      catch { failed += 1; }
    }
    this.status(added || failed ? `${added} new assessment${added === 1 ? "" : "s"} analysed; ${failed} file${failed === 1 ? "" : "s"} need manual import/review.` : "Folder scan complete. No new assessment-like files were found.");
  },

  async hasDownloadsPermission() {
    return chrome.permissions.contains({ permissions: ["downloads"] });
  },

  async connectDownloads() {
    const granted = await chrome.permissions.request({ permissions: ["downloads"] });
    if (!granted) return this.status("Download-history access was not granted. Direct file import still works.");
    await this.scanDownloadHistory();
    await this.renderPermission();
  },

  async disconnectDownloads() {
    const removed = await chrome.permissions.remove({ permissions: ["downloads"] });
    await this.renderPermission();
    this.status(removed ? "Download-history access removed. Existing local intake cards were preserved." : "Download-history permission was already unavailable.");
  },

  async addMetadataCandidate(download) {
    const filename = this.basename(download.filename);
    if (download.state && download.state !== "complete") return false;
    if (!this.isSupported(filename) || (this.settings.onlyLikely && !this.looksRelevant(filename))) return false;
    const fingerprint = `download:${download.id}`;
    if (this.items.some(item => item.fingerprint === fingerprint)) return false;
    this.items.unshift({
      id: crypto.randomUUID(), fingerprint, filename, source: "download-history", sourceRead: false,
      downloadId: download.id, detectedAt: Date.parse(download.startTime || "") || Date.now(), state: "pending",
      analysis: this.analyze(filename, "", "metadata"),
      readNote: "Metadata only. Import this file or grant folder access to read its contents.",
    });
    return true;
  },

  async scanDownloadHistory() {
    if (!(await this.hasDownloadsPermission())) return;
    const startedAfter = new Date(Date.now() - 60 * 86400000).toISOString();
    const downloads = await chrome.downloads.search({ startedAfter, orderBy: ["-startTime"], limit: 80 });
    let added = 0;
    for (const download of downloads) if (download.state === "complete" && await this.addMetadataCandidate(download)) added += 1;
    const saved = await chrome.storage.local.get(this.DOWNLOAD_EVENTS_KEY);
    for (const event of Array.isArray(saved[this.DOWNLOAD_EVENTS_KEY]) ? saved[this.DOWNLOAD_EVENTS_KEY] : []) if (await this.addMetadataCandidate(event)) added += 1;
    await this.save();
    this.status(added ? `${added} likely assessment download${added === 1 ? "" : "s"} detected. File contents remain unread until you grant or import them.` : "Download history scanned. No new likely assessment files were detected.");
  },

  async renderPermission() {
    const badge = document.getElementById("assessment-intake-permission");
    const history = await this.hasDownloadsPermission();
    const handle = await this.getFolderHandle();
    let folder = false;
    try { folder = !!handle && await handle.queryPermission({ mode: "read" }) === "granted"; } catch {}
    const state = history && folder ? "full" : history || folder ? "partial" : "disconnected";
    badge.dataset.state = state;
    badge.textContent = state === "full" ? "History + files" : history ? "History only" : folder ? "Files only" : "Not connected";
    document.getElementById("assessment-downloads-connect").textContent = history ? "Rescan download history" : "Connect download history";
    document.getElementById("assessment-downloads-disconnect").disabled = !history;
    document.getElementById("assessment-folder-connect").textContent = folder ? `Folder: ${handle.name}` : "Grant Downloads folder";
    document.getElementById("assessment-folder-forget").disabled = !handle;
  },

  deadlineLabel(item) {
    if (!item.analysis.dueDate) return "Deadline needs review";
    const due = new Date(`${item.analysis.dueDate}T12:00:00`);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const days = Math.ceil((due - today) / 86400000);
    const date = due.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return `${date} · ${days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `${days}d remaining`}`;
  },

  workloadSignal(item) {
    const dueDate = item.analysis.dueDate;
    if (!dueDate) return { state: "review", text: "Set the verified deadline to calculate workload pressure." };
    const due = new Date(`${dueDate}T12:00:00`);
    const collisions = this.items.filter(other => other.id !== item.id && other.state !== "dismissed" && other.analysis?.dueDate && Math.abs(new Date(`${other.analysis.dueDate}T12:00:00`) - due) <= 2 * 86400000).length;
    if (typeof Schedule === "undefined" || !Schedule.active || typeof Assignments === "undefined") {
      return { state: collisions ? "collision" : "review", text: collisions ? `${collisions} other deadline${collisions === 1 ? "" : "s"} within 48 hours.` : "Activate a timetable to compare this plan with real flexible capacity." };
    }
    const slots = Assignments.flexibleSlots({ dueDate });
    const capacity = slots.reduce((total, slot) => {
      const conflicts = Assignments.occupied(slot.dateKey);
      const occupied = conflicts.reduce((sum, range) => sum + Math.max(0, Math.min(slot.end, range.end) - Math.max(slot.start, range.start)), 0);
      return total + Math.max(0, slot.end - slot.start - occupied);
    }, 0);
    const needed = Number(item.analysis.estimatedMinutes || 0);
    if (capacity < needed) return { state: "overload", text: `${needed - capacity} min exceed visible flexible capacity before the deadline${collisions ? ` · ${collisions} nearby deadline${collisions === 1 ? "" : "s"}` : ""}.` };
    if (collisions) return { state: "collision", text: `${capacity} min flexible capacity found · ${collisions} other deadline${collisions === 1 ? "" : "s"} within 48 hours.` };
    return { state: "fit", text: `${capacity} min of visible flexible capacity before the deadline for a ${needed} min plan.` };
  },

  render() {
    const pending = this.items.filter(item => item.state === "pending");
    const imported = this.items.filter(item => item.state === "accepted");
    const high = pending.filter(item => item.analysis.dueDate && (new Date(`${item.analysis.dueDate}T12:00:00`) - Date.now()) / 86400000 <= 3).length;
    document.getElementById("assessment-intake-summary").innerHTML = `<div><strong>${pending.length}</strong><span>review</span></div><div><strong>${high}</strong><span>near due</span></div><div><strong>${imported.length}</strong><span>accepted</span></div>`;
    const list = document.getElementById("assessment-intake-list");
    if (!this.items.length) {
      list.innerHTML = '<p class="empty-state">No assessment files detected. Connect download history, grant a folder, or import a real brief.</p>';
      return;
    }
    list.innerHTML = this.items.slice(0, 30).map(item => {
      const analysis = item.analysis;
      const workload = this.workloadSignal(item);
      const tasksCreated = typeof Tasks !== "undefined" ? Tasks.data.filter(task => task.sourceId?.startsWith(`${item.id}:`)).length : 0;
      const requirements = analysis.requirements.length ? analysis.requirements.map(value => `<li>${escapeHtml(value)}</li>`).join("") : '<li>No reliable requirement lines extracted yet.</li>';
      const steps = analysis.steps.map(step => `<li><span>${escapeHtml(step.phase)}</span><strong>${escapeHtml(step.label)}</strong><small>${Number(step.minutes)} min</small></li>`).join("");
      return `<article class="assessment-intake-card" data-intake-id="${escapeAttribute(item.id)}" data-state="${escapeAttribute(item.state)}" data-confidence="${escapeAttribute(analysis.confidence)}">
        <header><div><span>${escapeHtml(item.filename)}</span><strong>${escapeHtml(this.deadlineLabel(item))}</strong></div><em>${escapeHtml(analysis.confidence)} confidence</em></header>
        <div class="assessment-review-fields">
          <label>Title<input data-field="title" value="${escapeAttribute(analysis.title)}" maxlength="120" aria-label="Detected assessment title"${item.state === "accepted" ? " disabled" : ""}></label>
          <label>Subject<input data-field="subject" value="${escapeAttribute(analysis.subject)}" maxlength="48" aria-label="Detected assessment subject"${item.state === "accepted" ? " disabled" : ""}></label>
          <label>Deadline<input data-field="dueDate" type="date" value="${escapeAttribute(analysis.dueDate)}" aria-label="Detected assessment deadline"${item.state === "accepted" ? " disabled" : ""}></label>
        </div>
        <p class="assessment-description">${escapeHtml(analysis.description)}</p>
        <p class="assessment-evidence"><strong>Deadline evidence:</strong> ${escapeHtml(analysis.dueEvidence)}</p>
        <p class="assessment-load-signal" data-state="${escapeAttribute(workload.state)}">${escapeHtml(workload.text)}</p>
        <details><summary>Requirements and ${analysis.steps.length}-step launch plan</summary><h4>Detected requirements</h4><ul>${requirements}</ul><h4>Action plan · ${analysis.estimatedMinutes} min estimated</h4><ol class="assessment-step-list">${steps}</ol></details>
        <p class="assessment-read-note">${escapeHtml(item.readNote || "Local derived data only.")}${tasksCreated ? ` · ${tasksCreated} task${tasksCreated === 1 ? "" : "s"} created` : ""}</p>
        <div class="assessment-card-actions">
          ${item.state === "pending" ? '<button data-action="accept">Accept + add deadline</button>' : '<button data-action="undo-accept" class="secondary-btn">Undo intake</button>'}
          <button data-action="start" class="secondary-btn">Start next step</button>
          <button data-action="tasks" class="secondary-btn">Add all steps</button>
          ${item.state === "accepted" ? '<button data-action="plan" class="secondary-btn">Plan sessions</button>' : ""}
          ${item.downloadId ? '<button data-action="show" class="secondary-btn">Show file</button>' : ""}
          <button data-action="ai" class="secondary-btn"${this.volatileText.has(item.fingerprint) && LocalAI?.isLoadedThisSession?.() ? "" : " disabled"}>Refine with Local AI</button>
          <button data-action="remove" class="secondary-btn">Remove</button>
        </div>
      </article>`;
    }).join("");
  },

  async updateField(item, field, value) {
    if (item.state === "accepted") return this.status("Undo intake before editing so the Assignment and Calendar deadline never drift apart.");
    if (!item.analysis || !["title", "subject", "dueDate"].includes(field)) return;
    item.analysis[field] = String(value).trim().slice(0, field === "title" ? 120 : 48);
    item.analysis.confidence = item.analysis.title && item.analysis.subject && item.analysis.dueDate ? "reviewed" : "review";
    await this.save();
    this.status("Draft corrected locally. Accept when the title, subject and deadline are right.");
  },

  async accept(item) {
    const analysis = item.analysis;
    if (!analysis.title || !analysis.subject || !analysis.dueDate) return this.status("Review the title, subject and deadline before accepting this assessment.");
    if (!Assignments.items.length) await Assignments.load();
    let assignment = Assignments.items.find(entry => entry.sourceFingerprint === item.fingerprint || entry.id === item.acceptedAssignmentId);
    if (!assignment) {
      assignment = {
        id: crypto.randomUUID(), title: analysis.title, subject: analysis.subject, dueDate: analysis.dueDate,
        estimatedMinutes: analysis.estimatedMinutes, priority: this.priorityFor(analysis.dueDate), done: false, createdAt: Date.now(),
        description: analysis.description, requirements: analysis.requirements, steps: analysis.steps, type: analysis.type || "general", weight: 0,
        source: "assessment-intake", sourceFingerprint: item.fingerprint, intakeId: item.id,
      };
      Assignments.items.push(assignment);
      await Assignments.save();
    }
    const deadlineEvent = `Deadline · ${analysis.subject} · ${analysis.title}`;
    const calendarResult = await CalendarRepository.addLegacy(analysis.dueDate, deadlineEvent);
    CalendarRepository.syncCalendar(calendarResult);
    await Calendar.render();
    item.state = "accepted";
    item.acceptedAssignmentId = assignment.id;
    item.deadlineEvent = deadlineEvent;
    item.deadlineEntryId = calendarResult.inverse[0]?.id || null;
    item.acceptedAt = Date.now();
    await this.save();
    await Today?.render?.();
    this.status("Assessment accepted. Its deadline is visible on the dashboard and calendar; work sessions still require review.");
  },

  priorityFor(dateKey) {
    const days = (new Date(`${dateKey}T12:00:00`) - Date.now()) / 86400000;
    return days <= 3 ? "high" : days <= 10 ? "medium" : "low";
  },

  async undoAccept(item) {
    Assignments.items = Assignments.items.filter(entry => entry.id !== item.acceptedAssignmentId);
    await Assignments.save();
    if (item.deadlineEvent && item.deadlineEntryId) {
      const calendarResult = await CalendarRepository.transaction([{ type: "removeLegacy", dateKey: item.analysis.dueDate, id: item.deadlineEntryId, text: item.deadlineEvent }]);
      CalendarRepository.syncCalendar(calendarResult);
      await Calendar.render();
    }
    item.state = "pending";
    item.acceptedAssignmentId = null;
    item.deadlineEvent = null;
    item.deadlineEntryId = null;
    await this.save();
    this.status("Assessment intake undone. Existing action tasks were preserved so completed work is never lost.");
  },

  async addTasks(item, onlyFirst = false) {
    const existingFor = step => Tasks.data.find(task => task.source === "assessment-step" && task.sourceId === `${item.id}:${step.id}`);
    const steps = onlyFirst ? item.analysis.steps.filter(step => !existingFor(step)?.done).slice(0, 1) : item.analysis.steps;
    let added = 0;
    steps.forEach((step, index) => {
      const sourceId = `${item.id}:${step.id || index}`;
      if (Tasks.data.some(task => task.source === "assessment-step" && task.sourceId === sourceId)) return;
      Tasks.add(`${item.analysis.subject}: ${step.label}`, null, step.minutes, {
        priority: this.priorityFor(item.analysis.dueDate), dueAt: item.analysis.dueDate ? new Date(`${item.analysis.dueDate}T17:00:00`).getTime() : null,
        priorityReason: "assessment deadline", source: "assessment-step", sourceId, deferSave: true,
      });
      added += 1;
    });
    if (added) await Tasks.save();
    this.status(added ? `${added} actionable step${added === 1 ? "" : "s"} added to Tasks.` : "Those open assessment steps already exist in Tasks.");
    return steps[0] ? Tasks.data.find(task => task.sourceId === `${item.id}:${steps[0].id || 0}` && !task.done) : null;
  },

  async startNow(item) {
    const task = await this.addTasks(item, true);
    if (!task) return;
    await chrome.storage.local.set({ hq_current_focus_task: { id: task.id, text: task.text, venture: task.venture || null, startedAt: Date.now() } });
    await ContextBus?.patch?.({ activeTaskId: task.id, activeTaskText: task.text, activeVenture: task.venture || null });
    document.getElementById("pomo-mode").value = "25";
    Pomodoro.reset();
    if (!Pomodoro.running) await Pomodoro.toggle();
    document.querySelector('.dock-btn[data-panel="pomodoro-flyout"]')?.click();
    this.status(`Focus started: ${task.text}`);
  },

  async refineWithAI(item) {
    const text = this.volatileText.get(item.fingerprint);
    if (!text) return this.status("Re-import the file in this tab before asking Local AI to refine it; full source text is deliberately not stored.");
    if (!LocalAI.isLoadedThisSession()) return this.status("Load Local AI from Settings first.");
    this.status("Local AI is checking the extracted brief. Nothing is uploaded…");
    const refined = await LocalAI.analyzeAssessment(text, item.analysis);
    item.analysis = { ...item.analysis, ...refined, dueDate: item.analysis.dueDate, dueEvidence: item.analysis.dueEvidence, confidence: "ai-reviewed" };
    item.analysis.steps = Array.isArray(refined.steps) && refined.steps.length ? refined.steps.slice(0, 10).map((step, index) => ({ id:`step-${index + 1}`, label:String(step.label || step).slice(0,180), minutes:Math.max(15,Math.min(180,Number(step.minutes) || 30)), phase:String(step.phase || "Action").slice(0,30) })) : item.analysis.steps;
    item.analysis.requirements = Array.isArray(refined.requirements) ? refined.requirements.slice(0, 10).map(value => String(value).slice(0,260)) : item.analysis.requirements;
    item.analysis.estimatedMinutes = item.analysis.steps.reduce((sum, step) => sum + step.minutes, 0);
    await this.save();
    this.status("Local AI refinement complete. Deadline remains locked to deterministic source evidence; review before accepting.");
  },

  async action(event) {
    const button = event.target.closest("button[data-action]");
    const card = button?.closest("[data-intake-id]");
    if (!button || !card) return;
    const item = this.items.find(entry => entry.id === card.dataset.intakeId);
    if (!item) return;
    button.disabled = true;
    try {
      if (button.dataset.action === "accept") await this.accept(item);
      if (button.dataset.action === "undo-accept") await this.undoAccept(item);
      if (button.dataset.action === "tasks") await this.addTasks(item);
      if (button.dataset.action === "start") await this.startNow(item);
      if (button.dataset.action === "plan") Assignments.buildPlan(item.acceptedAssignmentId);
      if (button.dataset.action === "show" && await this.hasDownloadsPermission()) chrome.downloads.show(item.downloadId);
      if (button.dataset.action === "ai") await this.refineWithAI(item);
      if (button.dataset.action === "remove" && confirm(`Remove “${item.filename}” from Assessment Intake? Accepted assignments, calendar entries and tasks will be preserved.`)) {
        this.items = this.items.filter(entry => entry.id !== item.id);
        await this.save();
        this.status("Intake card removed. Accepted work was preserved.");
      }
    } catch (error) {
      console.error("Assessment intake action failed:", error);
      this.status(`That action stopped safely: ${error.message}`);
    } finally { if (button.isConnected) button.disabled = false; }
  },

  async scanAll() {
    this.status("Checking connected assessment sources…");
    if (await this.hasDownloadsPermission()) await this.scanDownloadHistory();
    await this.scanFolder(null, true);
    await this.renderPermission();
  },

  async boot() {
    if (this.booted) return;
    this.booted = true;
    await this.load();
    const backgroundScan = async () => {
      try {
        if (await this.hasDownloadsPermission()) await this.scanDownloadHistory();
        if (this.settings.autoScan) await this.scanFolder(null, true);
      } catch (error) {
        console.warn("Assessment background intake skipped:", error.message);
      }
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => backgroundScan(), { timeout: 3500 });
    else setTimeout(backgroundScan, 1200);
  },

  async init() {
    if (this.initialized) { await this.renderPermission(); this.render(); return; }
    this.initialized = true;
    await this.load();
    document.getElementById("assessment-auto-scan").checked = this.settings.autoScan !== false;
    document.getElementById("assessment-only-likely").checked = this.settings.onlyLikely !== false;
    document.getElementById("assessment-downloads-connect").onclick = () => this.connectDownloads().catch(error => this.status(`Download scan failed safely: ${error.message}`));
    document.getElementById("assessment-downloads-disconnect").onclick = () => this.disconnectDownloads().catch(error => this.status(`Permission removal failed safely: ${error.message}`));
    document.getElementById("assessment-folder-connect").onclick = () => this.connectFolder();
    document.getElementById("assessment-folder-forget").onclick = () => this.forgetFolder().catch(error => this.status(`Folder removal failed safely: ${error.message}`));
    document.getElementById("assessment-intake-refresh").onclick = () => this.scanAll().catch(error => this.status(`Scan stopped safely: ${error.message}`));
    document.getElementById("assessment-intake-clear").onclick = async () => {
      if (!confirm("Clear all Assessment Intake cards? Accepted assignments, calendar deadlines and tasks will be preserved.")) return;
      this.items = [];
      this.volatileText.clear();
      await this.save();
      this.status("Assessment Intake cleared. Accepted work was preserved.");
    };
    document.getElementById("assessment-file-input").onchange = event => { const files = [...event.currentTarget.files]; event.currentTarget.value = ""; this.importFiles(files); };
    document.getElementById("assessment-auto-scan").onchange = async event => { this.settings.autoScan = event.currentTarget.checked; await this.save(); };
    document.getElementById("assessment-only-likely").onchange = async event => { this.settings.onlyLikely = event.currentTarget.checked; await this.save(); };
    document.getElementById("assessment-intake-list").onclick = event => this.action(event);
    document.getElementById("assessment-intake-list").onchange = event => {
      const input = event.target.closest("[data-field]");
      const card = input?.closest("[data-intake-id]");
      const item = card && this.items.find(entry => entry.id === card.dataset.intakeId);
      if (item) this.updateField(item, input.dataset.field, input.value);
    };
    await this.renderPermission();
    this.render();
    if (await this.hasDownloadsPermission()) await this.scanDownloadHistory();
    if (this.settings.autoScan) await this.scanFolder(null, true);
  },
};
