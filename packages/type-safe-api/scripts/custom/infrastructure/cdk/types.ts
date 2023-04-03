
export interface Arguments {
  /**
   * Language to generate code in
   */
  readonly language: string;

  /**
   * Absolute path to the parsed openapi specification
   */
  readonly specPath: string;

  /**
   * Absolute path to the source directory in which to write the infrastructure code
   */
  readonly sourcePath: string;

  /**
   * Generated client package for use in imports (format is language specific)
   */
  readonly generatedClientPackage: string;

  /**
   * Api infrastructure package; the name of the package that this code is generated into (format is language specific)
   */
  readonly infraPackage: string;

  /**
   * Absolute path to the resource directory (required for java only)
   */
  readonly resourcePath: string;
}

export interface ConstructGenerationArguments extends Arguments {
  /**
   * Relative path to specification from the output path
   */
  readonly relativeSpecPath: string;
}
