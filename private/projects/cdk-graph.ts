/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { Project } from "projen";
import { Stability } from "projen/lib/cdk";
import { PDKProject } from "../pdk-project";

/**
 * cdk-graph project.
 */
export class CdkGraphProject extends PDKProject {
  constructor(parent: Project) {
    super({
      parent,
      author: "AWS APJ COPE",
      authorAddress: "apj-cope@amazon.com",
      defaultReleaseBranch: "mainline",
      name: "cdk-graph",
      keywords: ["aws", "pdk", "jsii", "projen", "cdk", "graph", "cdk-graph"],
      repositoryUrl: "https://github.com/aws/aws-prototyping-sdk",
      devDeps: [
        "@aws-prototyping-sdk/pdk-nag@^0.x",
        "@aws-prototyping-sdk/pipeline@^0.x",
        "@aws-cdk/cfnspec",
        "@types/fs-extra",
        "@types/lodash.clonedeep",
        "@types/lodash.isempty",
        "@types/lodash.memoize",
        "@types/lodash.merge",
        "@types/lodash.omit",
        "@types/lodash.uniq",
        "@types/lodash.uniqby",
        "@types/traverse",
        "aws-cdk-lib",
        "constructs",
        "projen",
      ],
      peerDeps: ["projen", "aws-cdk-lib", "constructs"],
      bundledDeps: [
        "chalk@^4.x",
        "find-up@^4.x",
        "fs-extra",
        "lodash.clonedeep",
        "lodash.isempty",
        "lodash.memoize",
        "lodash.merge",
        "lodash.omit",
        "lodash.uniq",
        "lodash.uniqby",
        "shorthash2",
        "traverse",
      ],
      stability: Stability.EXPERIMENTAL,
      tsconfig: {
        compilerOptions: {
          esModuleInterop: true,
        },
      },
      tsconfigDev: {
        compilerOptions: {
          noEmit: true,
          noUnusedLocals: false,
          noImplicitAny: false,
          noImplicitReturns: false,
          noImplicitThis: false,
          noUnusedParameters: false,
        },
      },
      // Only publish to NPM until more stable - currently very experimental and need to test Typescript version more extensively
      publishToPypiConfig: false,
      publishToMavenConfig: false,
    });

    this.eslint?.addIgnorePattern("scripts/**");

    this.jest?.addIgnorePattern("/\\.tmp/");
    this.jest?.addIgnorePattern("/__\\w+__/");
    this.jest?.addWatchIgnorePattern("/\\.tmp/");
  }
}
