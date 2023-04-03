/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { NodePackageManager } from "projen/lib/javascript";
import { Language, SmithyApiGatewayTsProject } from "../../../src";
import { synthSmithyCodeProject } from "../smithy-test-utils";

describe("Smithy Api Gateway Ts Standalone Unit Tests", () => {
  it.each([
    NodePackageManager.YARN,
    NodePackageManager.YARN2,
    NodePackageManager.NPM,
    NodePackageManager.PNPM,
  ])("With Package Manager %s", (packageManager) => {
    const project = new SmithyApiGatewayTsProject({
      defaultReleaseBranch: "mainline",
      name: "@test/my-api",
      clientLanguages: [
        Language.TYPESCRIPT,
        Language.PYTHON,
        Language.JAVA,
      ],
      packageManager,
      serviceName: { namespace: "example.hello", serviceName: "Hello" },
    });
    expect(synthSmithyCodeProject(project)).toMatchSnapshot();
  });
});
