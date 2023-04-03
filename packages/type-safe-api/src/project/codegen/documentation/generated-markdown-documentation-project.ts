import { Project, ProjectOptions, Task } from "projen";
import { buildInvokeOpenApiGeneratorCommand, NonClientGeneratorDirectory } from "../components/utils";
import * as path from "path";
import { DocumentationFormat } from "../../languages";

export interface GeneratedMarkdownDocumentationProjectOptions extends ProjectOptions {
  /**
   * Path to the OpenAPI Specification for which to generate docs, relative to the project outdir
   */
  readonly specPath: string;
}

export class GeneratedMarkdownDocumentationProject extends Project {

  private readonly generateTask: Task;

  constructor(options: GeneratedMarkdownDocumentationProjectOptions) {
    super(options);

    this.generateTask = this.addTask('generate');

    const cmd = buildInvokeOpenApiGeneratorCommand({
      generator: DocumentationFormat.MARKDOWN,
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
      "Apis",
      "Models",
      "README.md",
    );
  }
}
