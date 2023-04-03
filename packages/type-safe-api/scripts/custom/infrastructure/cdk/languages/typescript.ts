import { ConstructGenerationArguments } from "../types";
import { writeFile } from "projen/lib/util";
import * as path from 'path';

export const generateTypescriptTypeSafeCdkConstruct = (options: ConstructGenerationArguments) => {
  writeFile(path.join(options.sourcePath, "index.ts"), `export * from "./api"`, { readonly: true });
  writeFile(path.join(options.sourcePath, "api.ts"), `import { TypeSafeRestApi, TypeSafeRestApiProps, OpenApiIntegration } from "@aws-prototyping-sdk/type-safe-api";
import { Construct } from "constructs";
import { OperationLookup, OperationConfig } from "${options.generatedClientPackage}";
import * as path from "path";

export type ApiIntegrations = OperationConfig<OpenApiIntegration>;

export interface ApiProps extends Omit<TypeSafeRestApiProps, "specPath" | "operationLookup" | "integrations"> {
  readonly integrations: ApiIntegrations;
}

/**
 * Type-safe construct for the API Gateway resources defined by your model.
 * This construct is generated and should not be modified.
 */
export class Api extends TypeSafeRestApi {
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id, {
      ...props,
      integrations: props.integrations as any,
      specPath: path.resolve(__dirname, "${options.relativeSpecPath}"),
      operationLookup: OperationLookup as any,
    });
  }
}
`, { readonly: true });
};
