import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const decoderFile = /\/react-server-dom-(?:webpack|turbopack)-(?:server|client)\.[^/]+\.(?:production|development)\.js$/;

export function describeDecoder(moduleId: string) {
  const filename = moduleId.replace(/^\0/, "").split("?")[0];
  if (!decoderFile.test(filename.replaceAll("\\", "/"))) return null;
  const real = fs.realpathSync(filename);
  let directory = path.dirname(real);
  while (true) {
    const manifest = path.join(directory, "package.json");
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (/^react-server-dom-(?:webpack|turbopack)$/.test(pkg.name ?? "")) {
        if (!["19.2.9", "19.3.1"].includes(pkg.version)) throw new Error(`Unreviewed bundled RSC decoder: ${pkg.name}@${pkg.version}`);
        return { package:pkg.name as string, version:pkg.version as string,
          source:path.relative(directory, real).replaceAll("\\", "/"),
          origin:real.replaceAll("\\", "/").includes("/dist/vendor/react-server-dom/") ? "plugin-vendor" : "project",
          sha256:createHash("sha256").update(fs.readFileSync(real)).digest("hex") };
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Cannot establish bundled RSC decoder package provenance.");
    directory = parent;
  }
}

// Uses the output chunk graph, not merely installed versions or resolver guesses.
export function securityRscProof(): Plugin {
  let root = "";
  return {
    name:"ohq:bundled-rsc-proof", apply:"build", enforce:"post",
    configResolved(config) { root = config.root; },
    generateBundle(_options, bundle) {
      // plugin-rsc runs two reference-analysis builds with write=false. Those
      // deliberately strip runtime code and are not deployment artifacts.
      if (this.environment.config.build.write === false) return;
      const environment = this.environment.name;
      const ids = new Set(Object.values(bundle).flatMap(output => output.type === "chunk" ? Object.keys(output.modules).filter(id => output.modules[id].renderedLength > 0) : []));
      const decoders = [...ids].map(describeDecoder).filter(item => item !== null);
      if (environment === "rsc" && !decoders.some(item => item.source.includes("server."))) throw new Error("Production RSC build has no proven bundled server decoder; promotion is blocked.");
      const directory = path.join(root, ".sites-runtime", "security-proof");
      fs.mkdirSync(directory, {recursive:true});
      fs.writeFileSync(path.join(directory, `${environment}.json`), JSON.stringify({schema:1,environment,decoders},null,2)+"\n");
      console.log(`[ohq:rsc-proof] ${environment}: ${decoders.map(item => `${item.origin}:${item.package}@${item.version}:${item.source}`).join(", ") || "no RSC decoder included"}`);
    },
  };
}
