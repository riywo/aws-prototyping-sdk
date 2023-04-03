import { JavaProject, JavaProjectOptions } from "projen/lib/java";
import { DependencyType } from "projen";
import { GeneratedJavaClientProject } from "../../clients/generated-java-client-project";
import * as path from 'path';
import { buildGenerateCdkInfrastructureCommand } from "../../components/utils";
import { Language } from "../../../languages";

export interface GeneratedJavaCdkInfrastructureProjectOptions extends JavaProjectOptions {
  /**
   * OpenAPI spec path, relative to the project outdir
   */
  readonly specPath: string;
  /**
   * The generated java client
   */
  readonly generatedJavaClient: GeneratedJavaClientProject;
}

export class GeneratedJavaCdkInfrastructureProject extends JavaProject {
  constructor(options: GeneratedJavaCdkInfrastructureProjectOptions) {
    super({
      ...options,
      sample: false,
      junit: false,
    });

    [
      "software.aws.awsprototypingsdk/type-safe-api@^0",
      "software.constructs/constructs@^10",
      "software.amazon.awscdk/aws-cdk-lib@^2",
      "io.github.cdklabs/cdknag@^2",
      "org.projectlombok/lombok@^1",
      "com.fasterxml.jackson.core/jackson-databind@^2",
      "io.github.cdklabs/projen@^0",
      `${options.generatedJavaClient.pom.groupId}/${options.generatedJavaClient.pom.artifactId}@${options.generatedJavaClient.pom.version}`,
    ]
      .filter(
        (dep) =>
          !this.deps.tryGetDependency(dep.split("@")[0], DependencyType.RUNTIME)
      )
      .forEach((dep) => this.addDependency(dep));

    // Remove the projen test dependency since otherwise it takes precedence, causing projen to be unavailable at synth time
    this.deps.removeDependency("io.github.cdklabs/projen", DependencyType.TEST);

    // Add a dependency on the generated java client repository
    this.pom.addRepository({
      url: `file://${path.relative(this.outdir, options.generatedJavaClient.outdir)}/dist/java`,
      id: `${options.generatedJavaClient.pom.groupId}-${options.generatedJavaClient.pom.artifactId}-repo`,
    });

    const infraPackage = `${this.pom.groupId}.${this.name}.infra`;

    const relativeSourcePathParts = ["src", "main", "java", ...infraPackage.split(".")];

    const generateInfraCommand = buildGenerateCdkInfrastructureCommand({
      language: Language.JAVA,
      sourcePath: path.join(this.outdir, ...relativeSourcePathParts),
      resourcePath: path.join(this.outdir, "src", "main", "resources"),
      generatedClientPackage: options.generatedJavaClient.clientPackage,
      infraPackage,
      // Spec path relative to the source directory
      specPath: path.join(...relativeSourcePathParts.map(() => ".."), options.specPath),
    });

    const generateTask = this.addTask('generate');
    generateTask.exec(generateInfraCommand.command, {
      cwd: path.relative(this.outdir, generateInfraCommand.workingDir),
    });

    this.preCompileTask.spawn(generateTask);
  }
}
