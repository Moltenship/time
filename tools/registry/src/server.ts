import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join, normalize, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Older than any minimum release age a package manager enforces. */
const publishedAt = "2000-01-01T00:00:00.000Z";

interface Tarball {
  readonly file: string;
  readonly bytes: Buffer;
  readonly manifest: { readonly name: string; readonly version: string } & Record<string, unknown>;
}

export interface LocalRegistryServer {
  /** `http://127.0.0.1:<port>` */
  readonly origin: string;
  /** Where `.npmrc` points the `@moltenship` scope, when tarballs are served. */
  readonly npmRegistry: string;
  readonly close: () => Promise<void>;
}

export interface LocalRegistryServerOptions {
  /** Served as is: `<siteDir>/r/month-view.json` is `/r/month-view.json`. */
  readonly siteDir: string;
  /** Packed packages served as an npm registry under `/npm/`, or none. */
  readonly tarballDir?: string;
}

async function readTarballs(directory: string): Promise<Map<string, Tarball>> {
  const tarballs = new Map<string, Tarball>();
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".tgz")).sort()) {
    const path = join(directory, file);
    const { stdout } = await execFileAsync("tar", ["-xzOf", path, "package/package.json"]);
    const manifest = JSON.parse(stdout) as Tarball["manifest"];
    tarballs.set(manifest.name, { bytes: await readFile(path), file, manifest });
  }
  return tarballs;
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { "content-type": type });
  response.end(body);
}

/**
 * One local server for the install test: the built registry under `/r/`, and an npm registry for
 * the packed runtime packages under `/npm/`, which the test apps use for the `@moltenship` scope
 * only. Everything else still comes from npm.
 */
export async function startLocalRegistryServer({
  siteDir,
  tarballDir,
}: LocalRegistryServerOptions): Promise<LocalRegistryServer> {
  const tarballs = tarballDir ? await readTarballs(tarballDir) : new Map<string, Tarball>();
  let origin = "";

  const server = createServer((request, response) => {
    void (async () => {
      let path: string;
      try {
        path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      } catch {
        return send(response, 400, "text/plain", "bad request");
      }
      if (path.startsWith("/npm/")) {
        const rest = path.slice("/npm/".length);
        if (rest.startsWith("-/")) {
          const tarball = [...tarballs.values()].find(({ file }) => rest === `-/${file}`);
          if (tarball) return send(response, 200, "application/octet-stream", tarball.bytes);
          return send(response, 404, "application/json", '{"error":"not found"}');
        }
        const tarball = tarballs.get(rest);
        if (!tarball) return send(response, 404, "application/json", '{"error":"not found"}');
        const { version } = tarball.manifest;
        const packument = {
          name: tarball.manifest.name,
          "dist-tags": { latest: version },
          time: { created: publishedAt, modified: publishedAt, [version]: publishedAt },
          versions: {
            [version]: {
              ...tarball.manifest,
              dist: {
                tarball: `${origin}/npm/-/${tarball.file}`,
                integrity: `sha512-${createHash("sha512").update(tarball.bytes).digest("base64")}`,
                shasum: createHash("sha1").update(tarball.bytes).digest("hex"),
              },
            },
          },
        };
        return send(response, 200, "application/json", JSON.stringify(packument));
      }

      const file = normalize(join(siteDir, path));
      if (!file.startsWith(`${normalize(siteDir)}${sep}`)) {
        return send(response, 404, "text/plain", "not found");
      }
      try {
        return send(response, 200, "application/json", await readFile(file));
      } catch {
        return send(response, 404, "text/plain", "not found");
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    origin,
    npmRegistry: `${origin}/npm/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
