/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { JavaProject, JavaProjectOptions } from "projen/lib/java";
import { OpenApiGeneratorIgnoreFile } from "../components/open-api-generator-ignore-file";
import * as path from "path";
import { buildCleanGeneratedClientCommand, buildInvokeOpenApiGeneratorCommand } from "../components/utils";
import { Language } from "../../languages";

/**
 * Configuration for the generated java client project
 */
export interface GeneratedJavaClientProjectOptions extends JavaProjectOptions {
  /**
   * The path to the OpenAPI specification, relative to this project's outdir
   */
  readonly specPath: string;
}

const DEPENDENCIES: string[] = [
  // Required for open api generated client
  "io.swagger/swagger-annotations@1.6.8",
  "com.google.code.findbugs/jsr305@3.0.2",
  "com.squareup.okhttp3/okhttp@4.10.0",
  "com.squareup.okhttp3/logging-interceptor@4.10.0",
  "com.google.code.gson/gson@2.9.1",
  "io.gsonfire/gson-fire@1.8.5",
  "org.apache.commons/commons-lang3@3.12.0",
  "jakarta.annotation/jakarta.annotation-api@1.3.5",
  "org.openapitools/jackson-databind-nullable@0.2.4",
  "javax.ws.rs/jsr311-api@1.1.1",
  "javax.ws.rs/javax.ws.rs-api@2.1.1",
  // For handler wrappers
  "com.amazonaws/aws-lambda-java-core@1.2.1",
  "com.amazonaws/aws-lambda-java-events@3.11.0",
  // Lombok is used to add the builder pattern to models for neater construction
  "org.projectlombok/lombok@1.18.24",
];

const TEST_DEPENDENCIES: string[] = [
  "org.junit.jupiter/junit-jupiter-api@5.9.1",
  "org.mockito/mockito-core@3.12.4",
];

/**
 * Java project containing a java client (and lambda handler wrappers) generated using OpenAPI Generator CLI
 */
export class GeneratedJavaClientProject extends JavaProject {
  /**
   * The package name for the generated client, for use in imports
   */
  public readonly clientPackage: string;

  constructor(options: GeneratedJavaClientProjectOptions) {
    super({
      sample: false,
      junit: false,
      ...options,
    });

    // Ignore files that we will control via projen
    const ignoreFile = new OpenApiGeneratorIgnoreFile(this);
    ignoreFile.addPatterns(
      "pom.xml",
      "gradle",
      "gradle/**/*",
      "gradlew",
      "gradle.properties",
      "gradlew.bat",
      "build.gradle",
      "settings.gradle",
      "build.sbt",
      ".travis.yml",
      "git_push.sh",
      "src/test",
      "src/test/**/*",
      "src/main/AndroidManifest.xml",
    );

    // Add dependencies
    DEPENDENCIES.forEach((dep) => this.addDependency(dep));
    TEST_DEPENDENCIES.forEach((dep) => this.addTestDependency(dep));

    this.clientPackage = `${this.pom.groupId}.${this.name}.client`;

    // Generate the java client
    const generateCodeCommand = buildInvokeOpenApiGeneratorCommand({
      generator: "java",
      specPath: options.specPath,
      outputPath: this.outdir,
      generatorDirectory: Language.JAVA,
      additionalProperties: {
        useSingleRequestParameter: "true",
        groupId: this.pom.groupId,
        artifactId: this.pom.artifactId,
        artifactVersion: this.pom.version,
        invokerPackage: this.clientPackage,
        apiPackage: `${this.clientPackage}.api`,
        modelPackage: `${this.clientPackage}.model`,
        hideGenerationTimestamp: "true",
        additionalModelTypeAnnotations: [
          "@lombok.AllArgsConstructor",
          // Regular lombok builder is not used since an abstract base schema class is also annotated
          "@lombok.experimental.SuperBuilder",
        ].join("\\ "),
      },
      srcDir: path.join("src", "main", "java", ...this.clientPackage.split(".")),
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
      "docs",
      "api",
      "README.md",
      ".openapi-generator",
    );
  }
}
