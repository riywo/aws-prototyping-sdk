/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import * as path from "path";
import { getLogger } from "log4js";
import { Project, TextFile } from "projen";
import {
  GeneratedJavaClientProject,
  GeneratedJavaClientProjectOptions,
} from "./clients/generated-java-client-project";
import {
  GeneratedPythonClientProject,
  GeneratedPythonClientProjectOptions,
} from "./clients/generated-python-client-project";
import {
  GeneratedTypescriptClientProject,
  GeneratedTypescriptClientProjectOptions,
} from "./clients/generated-typescript-client-project";
import { DocumentationFormat, Language } from "../languages";
import { GeneratedHtml2DocumentationProject } from "./documentation/generated-html2-documentation-project";
import { GeneratedHtmlRedocDocumentationProject } from "./documentation/generated-html-redoc-documentation-project";
import { GeneratedMarkdownDocumentationProject } from "./documentation/generated-markdown-documentation-project";
import { GeneratedPlantumlDocumentationProject } from "./documentation/generated-plantuml-documentation-project";
import {
  GeneratedTypescriptCdkInfrastructureProject
} from "./infrastructure/cdk/generated-typescript-cdk-infrastructure-project";
import {
  GeneratedPythonCdkInfrastructureProject
} from "./infrastructure/cdk/generated-python-cdk-infrastructure-project";
import { GeneratedJavaCdkInfrastructureProject } from "./infrastructure/cdk/generated-java-cdk-infrastructure-project";

const logger = getLogger();

// Some options that we'll infer automatically for each client project, unless overridden
type CommonProjectOptions =
  | "artifactId"
  | "generateClient"
  | "groupId"
  | "moduleName"
  | "name"
  | "outdir"
  | "specPath";

/**
 * Options for generating clients
 */
export interface GenerateClientProjectsOptions {
  /**
   * The parent project for the generated clients
   */
  readonly parent: Project;
  /**
   * The name of the api package, used to infer client names unless overrides are specified
   */
  readonly parentPackageName: string;
  /**
   * The directory in which to generate code for all clients
   */
  readonly generatedCodeDir: string;
  /**
   * Path to the parsed spec file
   * We use the parsed spec such that refs are resolved to support multi-file specs
   */
  readonly parsedSpecPath: string;
  /**
   * Options for the typescript client project.
   * These will override any inferred properties (such as the package name).
   */
  readonly typescriptOptions: Omit<
    GeneratedTypescriptClientProjectOptions,
    CommonProjectOptions
  >;
  /**
   * Options for the python client project
   * These will override any inferred properties (such as the package name).
   */
  readonly pythonOptions: Omit<
    GeneratedPythonClientProjectOptions,
    CommonProjectOptions
  >;
  /**
   * Options for the java client project
   * These will override any inferred properties (such as the package name).
   */
  readonly javaOptions: Omit<
    GeneratedJavaClientProjectOptions,
    CommonProjectOptions
  >;
}

// No dashes or underscores since this is used in the package name in imports
const sanitiseJavaProjectName = (name: string) => name
  .replace(/@/g, "")
  .replace(/[\-/_]/g, "");

// kebab-case for java artifact ids
const sanitiseJavaArtifactId = (name: string) => name
  .replace(/@/g, "")
  .replace(/[/_]/g, "-");

// kebab-case for typescript packages
const sanitiseTypescriptPackageName = (name: string) => name.replace(
  /_/g,
  "-"
);

// snake_case for python modules
const sanitisePythonModuleName = (name: string) => name
  .replace(/@/g, "")
  .replace(/[\-/]/g, "_");

// Use dashes in project name since distributable's PKG-INFO always converts _ to -
// https://stackoverflow.com/questions/36300788/python-package-wheel-pkg-info-name
const sanitisePythonPackageName = (name: string) => name
  .replace(/@/g, "")
  .replace(/[_/]/g, "-");

/**
 * Returns a generated client project for the given language
 */
const generateClientProject = (
  language: Language,
  options: GenerateClientProjectsOptions
): Project => {
  const clientName = `${options.parentPackageName}-${language}-client`;
  const commonOptions = {
    outdir: path.join(options.generatedCodeDir, language),
    specPath: options.parsedSpecPath,
    parent: options.parent,
  };

  switch (language) {
    case Language.TYPESCRIPT: {
      logger.trace("Attempting to generate TYPESCRIPT client project.");
      return new GeneratedTypescriptClientProject({
        ...commonOptions,
        name: sanitiseTypescriptPackageName(clientName),
        ...options.typescriptOptions,
      });
    }
    case Language.PYTHON: {
      logger.trace("Attempting to generate PYTHON client project.");
      return new GeneratedPythonClientProject({
        ...commonOptions,
        name: sanitisePythonPackageName(clientName),
        moduleName: sanitisePythonModuleName(clientName),
        ...options.pythonOptions,
      });
    }
    case Language.JAVA: {
      logger.trace("Attempting to generate JAVA client project.");
      return new GeneratedJavaClientProject({
        ...commonOptions,
        name: sanitiseJavaProjectName(clientName),
        artifactId: sanitiseJavaArtifactId(clientName),
        groupId: "com.generated.api",
        ...options.javaOptions,
      });
    }
    default:
      throw new Error(
        `Unknown client language ${language}`
      );
  }
};

export interface GenerateInfraProjectOptions extends GenerateClientProjectsOptions {
  /**
   * Name of the generated client package
   */
  readonly generatedClients: {
    readonly java?: GeneratedJavaClientProject;
    readonly python?: GeneratedPythonClientProject;
    readonly typescript?: GeneratedTypescriptClientProject;
  };
}

/**
 * Returns a generated infrastructure project for the given language
 */
export const generateInfraProject = (
  language: Language,
  options: GenerateInfraProjectOptions
): Project => {
  new TextFile(
    options.parent,
    path.join(options.generatedCodeDir, "README.md"),
    {
      lines: [
        "## Generated Infrastructure",
        "",
        "This directory contains a generated type-safe CDK construct which will can the API gateway infrastructure for an API based on your model.",
      ],
      readonly: true,
    }
  );

  const infraName = `${options.parentPackageName}-${language}-infra`;
  const commonOptions = {
    outdir: path.join(options.generatedCodeDir, language),
    specPath: options.parsedSpecPath,
    parent: options.parent,
  };

  switch (language) {
    case Language.TYPESCRIPT: {
      logger.trace("Attempting to generate TYPESCRIPT infra project.");
      if (!options.generatedClients.typescript) {
        throw new Error("A typescript client must be created for typescript infrastructure");
      }
      return new GeneratedTypescriptCdkInfrastructureProject({
        ...commonOptions,
        name: sanitiseTypescriptPackageName(infraName),
        generatedTypescriptClient: options.generatedClients.typescript,
        ...options.typescriptOptions,
      });
    }
    case Language.PYTHON: {
      logger.trace("Attempting to generate PYTHON infra project.");
      if (!options.generatedClients.python) {
        throw new Error("A python client must be created for python infrastructure");
      }
      return new GeneratedPythonCdkInfrastructureProject({
        ...commonOptions,
        name: sanitisePythonPackageName(infraName),
        moduleName: sanitisePythonModuleName(infraName),
        generatedPythonClient: options.generatedClients.python,
        ...options.pythonOptions,
      });
    }
    case Language.JAVA: {
      logger.trace("Attempting to generate JAVA infra project.");
      if (!options.generatedClients.java) {
        throw new Error("A java client must be created for java infrastructure");
      }
      return new GeneratedJavaCdkInfrastructureProject({
        ...commonOptions,
        name: sanitiseJavaProjectName(infraName),
        artifactId: sanitiseJavaArtifactId(infraName),
        groupId: "com.generated.api",
        generatedJavaClient: options.generatedClients.java,
        ...options.javaOptions,
      });
    }
    default:
      throw new Error(
        `Unknown infrastructure language ${language}`
      );
  }
};

/**
 * Generate API clients in the given languages
 * @param languages the languages to generate clients for
 * @param options options for the projects to be created
 */
export const generateClientProjects = (
  languages: Language[],
  options: GenerateClientProjectsOptions
): { [language: string]: Project } => {
  new TextFile(
    options.parent,
    path.join(options.generatedCodeDir, "README.md"),
    {
      lines: [
        "## Generated Clients",
        "",
        "This directory contains generated client code based on your API model.",
      ],
      readonly: true,
    }
  );

  const generatedClients: { [language: string]: Project } = {};
  languages.forEach((language) => {
    const project = generateClientProject(language, options);
    if (project != null) {
      generatedClients[language] = project;
    }
  });

  return generatedClients;
};

export interface GenerateDocsProjectsOptions {
  /**
   * The parent project for the generated clients
   */
  readonly parent: Project;
  /**
   * The name of the api package, used to infer doc package names
   */
  readonly parentPackageName: string;
  /**
   * The directory in which to generate docs for all formats
   */
  readonly generatedDocsDir: string;
  /**
   * Path to the parsed spec file
   * We use the parsed spec such that refs are resolved to support multi-file specs
   */
  readonly parsedSpecPath: string;
}

const generateDocsProject = (format: DocumentationFormat, options: GenerateDocsProjectsOptions): Project => {
  const commonProps = {
    name: `${options.parentPackageName}-documentation-${format.replace(/_/g, '-')}`,
    parent: options.parent,
    outdir: path.join(options.generatedDocsDir, format),
    specPath: options.parsedSpecPath,
  };

  switch (format) {
    case DocumentationFormat.HTML2: {
      return new GeneratedHtml2DocumentationProject(commonProps);
    }
    case DocumentationFormat.HTML_REDOC: {
      return new GeneratedHtmlRedocDocumentationProject(commonProps);
    }
    case DocumentationFormat.MARKDOWN: {
      return new GeneratedMarkdownDocumentationProject(commonProps);
    }
    case DocumentationFormat.PLANTUML: {
      return new GeneratedPlantumlDocumentationProject(commonProps);
    }
    default:
      throw new Error(
        `Unknown documentation format ${format}`
      );
  }
};

export const generateDocsProjects = (
  formats: DocumentationFormat[],
  options: GenerateDocsProjectsOptions,
): { [language: string]: Project } => {
  new TextFile(
    options.parent,
    path.join(options.generatedDocsDir, "README.md"),
    {
      lines: [
        "## Generated Documentation",
        "",
        "This directory contains generated documentation based on your API model.",
      ],
      readonly: true,
    }
  );

  const generatedClients: { [language: string]: Project } = {};
  formats.forEach((format) => {
    const project = generateDocsProject(format, options);
    if (project != null) {
      generatedClients[format] = project;
    }
  });

  return generatedClients;
};
