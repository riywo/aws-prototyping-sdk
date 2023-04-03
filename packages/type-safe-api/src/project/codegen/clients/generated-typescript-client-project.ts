/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { NodePackageManager, NpmConfig } from "projen/lib/javascript";
import {
  TypeScriptProject,
  TypeScriptProjectOptions,
} from "projen/lib/typescript";
import { OpenApiGeneratorIgnoreFile } from "../components/open-api-generator-ignore-file";
import * as path from 'path';
import { buildCleanGeneratedClientCommand, buildInvokeOpenApiGeneratorCommand } from "../components/utils";
import { Language } from "../../languages";

/**
 * Configuration for the generated typescript client project
 */
export interface GeneratedTypescriptClientProjectOptions
  extends TypeScriptProjectOptions {
  /**
   * The path to the OpenAPI specification, relative to this project's outdir
   */
  readonly specPath: string;
}

/**
 * Typescript project containing a typescript client (and lambda handler wrappers) generated using OpenAPI Generator CLI
 */
export class GeneratedTypescriptClientProject extends TypeScriptProject {
  /**
   * A reference to the npm config (generated for PNPM projects)
   */
  public readonly npmConfig?: NpmConfig;

  constructor(options: GeneratedTypescriptClientProjectOptions) {
    super({
      ...options,
      sampleCode: false,
      tsconfig: {
        ...options.tsconfig,
        compilerOptions: {
          lib: ["dom", "es2019"],
          // Generated code isn't very strict!
          strict: false,
          alwaysStrict: false,
          noImplicitAny: false,
          noImplicitReturns: false,
          noImplicitThis: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
          strictNullChecks: false,
          strictPropertyInitialization: false,
          ...options?.tsconfig?.compilerOptions,
        },
      },
      eslint: false,
      // Disable tests unless explicitly enabled
      jest: options.jest ?? false,
    });

    // Disable strict peer dependencies for pnpm as the default typescript project dependencies have type mismatches
    // (ts-jest@27 and @types/jest@28)
    if (this.package.packageManager === NodePackageManager.PNPM) {
      this.npmConfig = new NpmConfig(this);
      this.npmConfig.addConfig("strict-peer-dependencies", "false");
    }

    // For event and context types
    this.addDeps("@types/aws-lambda");

    // Tell OpenAPI Generator CLI not to generate files that we will generate via this project, or don't need.
    const openapiGeneratorIgnore = new OpenApiGeneratorIgnoreFile(this);
    openapiGeneratorIgnore.addPatterns(
      "package.json",
      "tsconfig.json",
      "tsconfig.esm.json",
      ".npmignore",
    );

    const generateCodeCommand = buildInvokeOpenApiGeneratorCommand({
      generator: "typescript-fetch",
      specPath: options.specPath,
      outputPath: this.outdir,
      generatorDirectory: Language.TYPESCRIPT,
      additionalProperties: {
        npmName: this.package.packageName,
        typescriptThreePlus: "true",
        useSingleParameter: "true",
        supportsES6: "true",
      },
      srcDir: this.srcdir,
      normalizers: {
        KEEP_ONLY_FIRST_TAG_IN_OPERATION: true,
      },
    });
    const cleanCommand = buildCleanGeneratedClientCommand(this.outdir);

    const generateTask = this.addTask('generate');
    generateTask.exec(cleanCommand.command, {
      cwd: path.relative(this.outdir, cleanCommand.workingDir),
    })
    generateTask.exec(generateCodeCommand.command, {
      cwd: path.relative(this.outdir, generateCodeCommand.workingDir),
    });

    this.preCompileTask.spawn(generateTask);

    // Ignore all the generated code
    this.gitignore.addPatterns(
      "src",
      ".npmignore",
      "README.md",
      ".openapi-generator",
    );
  }
}
