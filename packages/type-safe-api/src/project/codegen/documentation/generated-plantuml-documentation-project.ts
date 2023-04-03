import { Project, ProjectOptions, Task } from "projen";
import { buildInvokeOpenApiGeneratorCommand, NonClientGeneratorDirectory } from "../components/utils";
import * as path from "path";
import { DocumentationFormat } from "../../languages";

export interface GeneratedPlantumlDocumentationProjectOptions extends ProjectOptions {
  /**
   * Path to the OpenAPI Specification for which to generate docs, relative to the project outdir
   */
  readonly specPath: string;
}

export class GeneratedPlantumlDocumentationProject extends Project {

  private readonly generateTask: Task;

  constructor(options: GeneratedPlantumlDocumentationProjectOptions) {
    super(options);

    this.generateTask = this.addTask('generate');

    const cmd = buildInvokeOpenApiGeneratorCommand({
      generator: DocumentationFormat.PLANTUML,
      specPath: options.specPath,
      outputPath: this.outdir,
      generatorDirectory: NonClientGeneratorDirectory.DOCS,
    });
    this.generateTask.exec(cmd.command, {
      cwd: path.relative(this.outdir, cmd.workingDir),
    });

    this.compileTask.spawn(this.generateTask);

    this.gitignore.addPatterns(
      ".openapi-generator",
      "schemas.plantuml",
    );
  }
}
