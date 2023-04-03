import { PythonProject, PythonProjectOptions } from "projen/lib/python";
import { DependencyType } from "projen";
import { buildGenerateCdkInfrastructureCommand } from "../../components/utils";
import { Language } from "../../../languages";
import * as path from "path";
import { GeneratedPythonClientProject } from "../../clients/generated-python-client-project";

export interface GeneratedPythonCdkInfrastructureProjectOptions extends PythonProjectOptions {
  /**
   * OpenAPI spec path, relative to the project outdir
   */
  readonly specPath: string;
  /**
   * The generated python client
   */
  readonly generatedPythonClient: GeneratedPythonClientProject;
}

export class GeneratedPythonCdkInfrastructureProject extends PythonProject {
  constructor(options: GeneratedPythonCdkInfrastructureProjectOptions) {
    super({
      ...options,
      sample: false,
      venv: true,
      venvOptions: {
        // TODO: Create env in parent project if no workspace env available
        envdir: ".env",
        ...options?.venvOptions,
      },
      pip: true,
      poetry: false,
      pytest: false,
      setuptools: true,
    });

    ["aws_prototyping_sdk.type_safe_api", "constructs", "aws-cdk-lib", "cdk-nag", options.generatedPythonClient.moduleName]
      .filter((dep) => !this.deps.tryGetDependency(dep, DependencyType.RUNTIME))
      .forEach((dep) => this.addDependency(dep));

    const generateInfraCommand = buildGenerateCdkInfrastructureCommand({
      language: Language.PYTHON,
      sourcePath: path.join(this.outdir, this.moduleName),
      generatedClientPackage: options.generatedPythonClient.moduleName,
      infraPackage: this.moduleName,
      // Spec path relative to the source directory
      specPath: path.join("..", options.specPath),
    });

    const generateTask = this.addTask('generate');
    generateTask.exec(generateInfraCommand.command, {
      cwd: path.relative(this.outdir, generateInfraCommand.workingDir),
    });

    this.preCompileTask.spawn(generateTask);
  }
}