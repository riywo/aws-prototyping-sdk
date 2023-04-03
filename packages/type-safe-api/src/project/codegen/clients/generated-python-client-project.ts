/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import * as path from "path";
import { PythonProject, PythonProjectOptions } from "projen/lib/python";
import { Language } from "../../languages";
import { OpenApiGeneratorIgnoreFile } from "../components/open-api-generator-ignore-file";
import { buildCleanGeneratedClientCommand, buildInvokeOpenApiGeneratorCommand } from "../components/utils";

/**
 * Configuration for the generated python client project
 */
export interface GeneratedPythonClientProjectOptions
  extends PythonProjectOptions {
  /**
   * The path to the OpenAPI specification, relative to this project's outdir
   */
  readonly specPath: string;
}

/**
 * Python project containing a python client (and lambda handler wrappers) generated using OpenAPI Generator CLI
 */
export class GeneratedPythonClientProject extends PythonProject {
  constructor(options: GeneratedPythonClientProjectOptions) {
    super({
      sample: false,
      pytest: false,
      poetry: false,
      setuptools: true,
      pip: true,
      venv: true,
      ...options,
    });

    // With pip and venv (default), it's useful to install our package into the shared venv to make
    // it easier for other packages in the monorepo to take dependencies on this package.
    if ((options.venv ?? true) && (options.pip ?? true)) {
      this.depsManager.installTask.exec("pip install --editable .");
    }

    // Add dependencies required by the client
    [
      "certifi@^14.5.14",
      "frozendict@~2.3.4",
      "python-dateutil@~2.7.0",
      "setuptools@^21.0.0",
      "typing_extensions@~4.3.0",
      "urllib3@~1.26.7",
    ].forEach(dep => this.addDependency(dep));

    const openapiGeneratorIgnore = new OpenApiGeneratorIgnoreFile(this);
    openapiGeneratorIgnore.addPatterns(
      "test",
      "test/*",
      "test/**/*",
      ".gitlab-ci.yml",
      ".travis.yml",
      "git_push.sh",
      "tox.ini",
      "requirements.txt",
      "test-requirements.txt",
      "setup.py",
    );

    const generateCodeCommand = buildInvokeOpenApiGeneratorCommand({
      generator: "python",
      specPath: options.specPath,
      outputPath: this.outdir,
      generatorDirectory: Language.PYTHON,
      additionalProperties: {
        packageName: this.moduleName,
        projectName: this.name,
      },
      // Tell the generator where python source files live
      srcDir: this.moduleName,
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
      this.moduleName,
      "docs",
      "setup.cfg",
      "README.md",
      ".openapi-generator",
    );
  }
}
