import { parse } from "ts-command-line-args";
import * as path from 'path';
import * as fs from 'fs';

interface Arguments {
  /**
   * Path to the generated client project's outdir
   */
  readonly clientPath: string;
}

(() => {
  const args = parse<Arguments>({
    clientPath: { type: String },
  });

  // OpenAPI generator writes a manifest called FILES which lists the files it generated.
  const openApiGeneratedFilesManifestPath = path.join(
    args.clientPath,
    ".openapi-generator",
    "FILES"
  );

  // If the manifest exists, delete the files it lists
  if (fs.existsSync(openApiGeneratedFilesManifestPath)) {
    const previouslyGeneratedFiles = new Set(
      fs
        .readFileSync(openApiGeneratedFilesManifestPath, { encoding: "utf-8" })
        .split("\n")
        .filter((x) => x)
    );
    previouslyGeneratedFiles.forEach((previouslyGeneratedFile) => {
      fs.unlinkSync(path.join(args.clientPath, previouslyGeneratedFile));
    });
  }
})();
