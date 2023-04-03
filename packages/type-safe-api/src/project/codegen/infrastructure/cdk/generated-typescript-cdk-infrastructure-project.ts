import { TypeScriptProject, TypeScriptProjectOptions } from "projen/lib/typescript";
import { buildGenerateCdkInfrastructureCommand } from "../../components/utils";
import * as path from 'path';
import { Language } from "../../../languages";
import { DependencyType } from "projen";
import { GeneratedTypescriptClientProject } from "../../clients/generated-typescript-client-project";

export interface GeneratedTypescriptCdkInfrastructureProjectOptions extends TypeScriptProjectOptions {
  /**
   * OpenAPI spec path, relative to the project outdir
   */
  readonly specPath: string;
  /**
   * Name of the generated typescript client package
   */
  readonly generatedTypescriptClient: GeneratedTypescriptClientProject;
}

export class GeneratedTypescriptCdkInfrastructureProject extends TypeScriptProject {
  constructor(options: GeneratedTypescriptCdkInfrastructureProjectOptions) {
    super({
      ...options,
      sampleCode: false,
      jest: false,
      eslint: false,
      prettier: false,
      tsconfig: {
        compilerOptions: {
          lib: ["dom", "es2019"],
        },
      },
    });

    this.addDeps(
      ...[
        "@aws-prototyping-sdk/type-safe-api",
        "constructs",
        "aws-cdk-lib",
        "cdk-nag",
        // TODO: what happens if we're not in a workspace?
        options.generatedTypescriptClient.package.packageName,
      ].filter(
        (dep) => !this.deps.tryGetDependency(dep, DependencyType.RUNTIME)
      )
    );

    const generateInfraCommand = buildGenerateCdkInfrastructureCommand({
      language: Language.TYPESCRIPT,
      sourcePath: path.join(this.outdir, this.srcdir),
      generatedClientPackage: options.generatedTypescriptClient.package.packageName,
      infraPackage: this.package.packageName,
      // Spec path relative to the source directory
      specPath: path.join("..", options.specPath),
    });

    const generateTask = this.addTask('generate');
    generateTask.exec(generateInfraCommand.command, {
      cwd: path.relative(this.outdir, generateInfraCommand.workingDir),
    });

    this.preCompileTask.spawn(generateTask);

    // Ignore the generated code
    this.gitignore.addPatterns("src");
  }
}