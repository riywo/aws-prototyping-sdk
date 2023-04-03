import { parse } from "ts-command-line-args";
import * as path from 'path';
import * as fs from 'fs';
import { generateTypescriptTypeSafeCdkConstruct } from "./languages/typescript";
import { Arguments } from "./types";
import { generateJavaTypeSafeCdkConstruct } from "./languages/java";
import { generatePythonTypeSafeCdkConstruct } from "./languages/python";

(() => {
  const args = parse<Arguments>({
    specPath: { type: String },
    sourcePath: { type: String },
    resourcePath: { type: String },
    language: { type: String },
    infraPackage: { type: String },
    generatedClientPackage: { type: String },
  });

  const relativeSpecPath = path.relative(args.sourcePath, args.specPath);

  const options = {
    ...args,
    relativeSpecPath,
  };

  // Clean up and recreate the source path
  fs.rmSync(args.sourcePath, { force: true, recursive: true });
  fs.mkdirSync(args.sourcePath, { recursive: true });

  switch (args.language) {
    case "typescript":
      return generateTypescriptTypeSafeCdkConstruct(options);
    case "java":
      return generateJavaTypeSafeCdkConstruct(options);
    case "python":
      return generatePythonTypeSafeCdkConstruct(options);
    default:
      throw new Error(`Type-Safe CDK construct cannot be generated for unsupported language ${args.language}`);
  }
})();
