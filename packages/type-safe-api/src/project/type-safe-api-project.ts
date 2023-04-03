import { Project, ProjectOptions } from "projen";
import { DocumentationFormat, Language } from "./languages";
import { TypeSafeApiModelProject, } from "./model/type-safe-api-model-project";
import type { NxMonorepoProject } from "@aws-prototyping-sdk/nx-monorepo";
import * as path from "path";
import { GeneratedCodeOptions, ModelLanguage, ModelOptions } from "./types";
import { TypeScriptProject } from "projen/lib/typescript";
import { PythonProject } from "projen/lib/python";
import { JavaProject } from "projen/lib/java";
import { generateClientProjects, generateDocsProjects, generateInfraProject } from "./codegen/generate";
import { NodePackageManager } from "projen/lib/javascript";
import { GeneratedTypescriptClientProject } from "./codegen/clients/generated-typescript-client-project";
import { GeneratedPythonClientProject } from "./codegen/clients/generated-python-client-project";
import { GeneratedJavaClientProject } from "./codegen/clients/generated-java-client-project";

export interface TypeSafeApiProjectOptions extends ProjectOptions {
  /**
   * The language the API model is defined in.
   */
  readonly modelLanguage: ModelLanguage;
  /**
   * Options for the API model.
   */
  readonly modelOptions: ModelOptions;
  /**
   * Languages that API clients will be generated in
   */
  readonly clientLanguages: Language[];
  /**
   * Options for the generated clients
   */
  readonly clientOptions?: GeneratedCodeOptions;
  /**
   * The language to generate the type-safe CDK infrastructure in
   */
  readonly infrastructureLanguage: Language;
  /**
   * Options for the infrastructure package. Note that only those provided for the appropriate infrastructureLanguage
   * will apply.
   */
  readonly infrastructureOptions?: GeneratedCodeOptions;
  /**
   * Formats for generated documentation
   */
  readonly documentationFormats?: DocumentationFormat[];
}

export class TypeSafeApiProject extends Project {
  /**
   * The generated typescript client project. Will only be defined if typescript was specified as a client language.
   */
  public readonly typescriptClient?: TypeScriptProject;
  /**
   * The generated python client project. Will only be defined if python was specified as a client language.
   */
  public readonly pythonClient?: PythonProject;
  /**
   * The generated java client project. Will only be defined if java was specified as a client language.
   */
  public readonly javaClient?: JavaProject;

  /**
   * The generated typescript infrastructure project. Will only be defined if typescript was specified as the infrastructure language.
   */
  public readonly typescriptInfrastructure?: TypeScriptProject;
  /**
   * The generated python infrastructure project. Will only be defined if python was specified as the infrastructure language.
   */
  public readonly pythonInfrastructure?: PythonProject;
  /**
   * The generated java infrastructure project. Will only be defined if java was specified as the infrastructure language.
   */
  public readonly javaInfrastructure?: JavaProject;

  constructor(options: TypeSafeApiProjectOptions) {
    super(options);

    const parentMonorepo = this.getParentMonorepo(options);

    // API Definition project containing the model
    const definitionDir = "model";
    const definition = new TypeSafeApiModelProject({
      parent: parentMonorepo ?? this,
      outdir: parentMonorepo ? path.join(options.outdir!, definitionDir) : definitionDir,
      name: `${options.name}-model`,
      modelLanguage: options.modelLanguage,
      modelOptions: options.modelOptions,
    });
    const parsedSpecPathRelativeToProjectRoot = path.join(definitionDir, definition.parsedSpecFile);

    // Ensure we always generate a client for the infrastructure language, regardless of what was specified by the user
    const clientLanguages = [...new Set([...options.clientLanguages, options.infrastructureLanguage])];

    const clientDir = "clients";
    const clientDirRelativeToParent = parentMonorepo ? path.join(options.outdir!, clientDir) : clientDir;

    // Declare the generated clients projects
    const generatedClients = generateClientProjects(
      clientLanguages,
      {
        parent: parentMonorepo ?? this,
        parentPackageName: this.name,
        generatedCodeDir: clientDirRelativeToParent,
        // Spec path relative to each generated client dir
        parsedSpecPath: path.join("..", "..", parsedSpecPathRelativeToProjectRoot),
        typescriptOptions: {
          // Try to infer monorepo default release branch, otherwise default to mainline unless overridden
          defaultReleaseBranch: parentMonorepo?.release?.branches?.[0] ?? "mainline",
          packageManager: parentMonorepo ? parentMonorepo.package.packageManager : NodePackageManager.YARN,
          ...options.clientOptions?.typescript,
        },
        pythonOptions: {
          authorName: "APJ Cope",
          authorEmail: "apj-cope@amazon.com",
          version: "0.0.0",
          ...options.clientOptions?.python,
        },
        javaOptions: {
          version: "0.0.0",
          ...options.clientOptions?.java,
        },
      }
    );

    const documentationFormats = [...new Set(options.documentationFormats ?? [])];

    const docsDir = "documentation";
    const docsDirRelativeToParent = parentMonorepo ? path.join(options.outdir!, docsDir) : docsDir;

    const generatedDocs = generateDocsProjects(documentationFormats, {
      parent: parentMonorepo ?? this,
      parentPackageName: this.name,
      generatedDocsDir: docsDirRelativeToParent,
      // Spec path relative to each generated doc format dir
      parsedSpecPath: path.join("..", "..", parsedSpecPathRelativeToProjectRoot),
    });

    // Ensure the generated clients and docs projects have a dependency on the model project
    if (parentMonorepo) {
      [...Object.values(generatedClients), ...Object.values(generatedDocs)].forEach(client => {
        parentMonorepo.addImplicitDependency(client, definition);
      });
    }

    this.typescriptClient = generatedClients[Language.TYPESCRIPT] ? generatedClients[Language.TYPESCRIPT] as TypeScriptProject : undefined;
    this.javaClient = generatedClients[Language.JAVA] ? generatedClients[Language.JAVA] as JavaProject : undefined;
    this.pythonClient = generatedClients[Language.PYTHON] ? generatedClients[Language.PYTHON] as PythonProject : undefined;

    const infraDir = "infrastructure";
    const infraDirRelativeToParent = parentMonorepo ? path.join(options.outdir!, infraDir) : infraDir;

    // Infrastructure project
    const infraProject = generateInfraProject(options.infrastructureLanguage, {
      parent: parentMonorepo ?? this,
      parentPackageName: this.name,
      generatedCodeDir: infraDirRelativeToParent,
      // Spec path relative to each generated infra package dir
      parsedSpecPath: path.join("..", "..", parsedSpecPathRelativeToProjectRoot),
      typescriptOptions: {
        // Try to infer monorepo default release branch, otherwise default to mainline unless overridden
        defaultReleaseBranch: parentMonorepo?.release?.branches?.[0] ?? "mainline",
        packageManager: parentMonorepo ? parentMonorepo.package.packageManager : NodePackageManager.YARN,
        ...options.infrastructureOptions?.typescript,
      },
      pythonOptions: {
        authorName: "APJ Cope",
        authorEmail: "apj-cope@amazon.com",
        version: "0.0.0",
        // TODO: Venv!!!
        ...options.infrastructureOptions?.python,
      },
      javaOptions: {
        version: "0.0.0",
        ...options.infrastructureOptions?.java,
      },
      generatedClients: {
        typescript: this.typescriptClient as GeneratedTypescriptClientProject,
        python: this.pythonClient as GeneratedPythonClientProject,
        java: this.javaClient as GeneratedJavaClientProject,
      }
    });

    // Add implicit dependencies and assign the appropriate infrastructure project member
    switch (options.infrastructureLanguage) {
      case Language.JAVA:
        parentMonorepo?.addImplicitDependency?.(infraProject, this.javaClient!);
        this.javaInfrastructure = infraProject as JavaProject;
        break;
      case Language.PYTHON:
        parentMonorepo?.addImplicitDependency?.(infraProject, this.pythonClient!);
        this.pythonInfrastructure = infraProject as PythonProject;
        break;
      case Language.TYPESCRIPT:
        parentMonorepo?.addImplicitDependency?.(infraProject, this.typescriptClient!);
        this.typescriptInfrastructure = infraProject as TypeScriptProject;
        break;
      default:
        throw new Error(`Unknown infrastructure language ${options.infrastructureLanguage}`);
    }
    parentMonorepo?.addImplicitDependency?.(infraProject, definition);
  }

  private getParentMonorepo = (options: TypeSafeApiProjectOptions): NxMonorepoProject | undefined => {
    if (options.parent && "addImplicitDependency" in options.parent) {
      return options.parent as NxMonorepoProject;
    }
    return undefined;
  };
}
