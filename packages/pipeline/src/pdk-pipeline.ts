/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0 */
import { PDKNag } from "@aws-prototyping-sdk/pdk-nag";
import { Aspects, CfnOutput, RemovalPolicy, Stack, Stage } from "aws-cdk-lib";
import { Repository } from "aws-cdk-lib/aws-codecommit";
import { Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import {
  AddStageOpts,
  CodePipeline,
  CodePipelineProps,
  CodePipelineSource,
  ShellStep,
  ShellStepProps,
  StageDeployment,
} from "aws-cdk-lib/pipelines";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import {
  SonarCodeScanner,
  SonarCodeScannerConfig,
} from "./code_scanner/sonar-code-scanner";

export * from "./code_scanner/sonar-code-scanner";

const DEFAULT_BRANCH_NAME = "mainline";

/**
 * Properties to configure the PDKPipeline.
 *
 * Note: Due to limitations with JSII and generic support it should be noted that
 * the synth, synthShellStepPartialProps.input and
 * synthShellStepPartialProps.primaryOutputDirectory properties will be ignored
 * if passed in to this construct.
 *
 * synthShellStepPartialProps.commands is marked as a required field, however
 * if you pass in [] the default commands of this construct will be retained.
 */
export interface PDKPipelineProps extends CodePipelineProps {
  /**
   * Name of the CodeCommit repository to create.
   */
  readonly repositoryName: string;

  /**
   * Output directory for cdk synthesized artifacts i.e: packages/infra/cdk.out.
   */
  readonly primarySynthDirectory: string;

  /**
   * PDKPipeline by default assumes a NX Monorepo structure for it's codebase and
   * uses sane defaults for the install and run commands. To override these defaults
   * and/or provide additional inputs, specify env settings, etc you can provide
   * a partial ShellStepProps.
   */
  readonly synthShellStepPartialProps?: ShellStepProps;

  /**
   * Branch to trigger the pipeline execution.
   *
   * @default mainline
   */
  readonly defaultBranchName?: string;

  /**
   * Configuration for enabling Sonarqube code scanning on a successful synth.
   *
   * @default undefined
   */
  readonly sonarCodeScannerConfig?: SonarCodeScannerConfig;

  /**
   * Possible values for a resource's Removal Policy
   * The removal policy controls what happens to the resource if it stops being managed by CloudFormation.
   */
  readonly codeCommitRemovalPolicy?: RemovalPolicy;
}

/**
 * An extension to CodePipeline which configures sane defaults for a NX Monorepo
 * codebase. In addition to this, it also creates a CodeCommit repository with
 * automated PR builds and approvals.
 */
export class PDKPipeline extends CodePipeline {
  readonly codeRepository: Repository;
  private readonly sonarCodeScannerConfig?: SonarCodeScannerConfig;
  private readonly id: string;

  public constructor(scope: Construct, id: string, props: PDKPipelineProps) {
    const codeRepository = new Repository(scope, "CodeRepository", {
      repositoryName: props.repositoryName,
    });
    codeRepository.applyRemovalPolicy(
      props.codeCommitRemovalPolicy ?? RemovalPolicy.RETAIN
    );

    const accessLogsBucket = new Bucket(scope, "AccessLogsBucket", {
      versioned: false,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: BucketEncryption.S3_MANAGED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const artifactBucket = new Bucket(scope, "ArtifactsBucket", {
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: props.crossAccountKeys
        ? BucketEncryption.KMS
        : BucketEncryption.S3_MANAGED,
      encryptionKey: props.crossAccountKeys
        ? new Key(scope, "ArtifactKey", {
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.DESTROY,
          })
        : undefined,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsPrefix: "access-logs",
      serverAccessLogsBucket: accessLogsBucket,
    });

    const codePipeline = new Pipeline(scope, "CodePipeline", {
      enableKeyRotation: props.crossAccountKeys,
      restartExecutionOnUpdate: true,
      crossAccountKeys: props.crossAccountKeys,
      artifactBucket,
    });

    // ignore input and primaryOutputDirectory
    const {
      input,
      primaryOutputDirectory,
      commands,
      ...synthShellStepPartialProps
    } = props.synthShellStepPartialProps || {};

    const synthShellStep = new ShellStep("Synth", {
      input: CodePipelineSource.codeCommit(
        codeRepository,
        props.defaultBranchName || DEFAULT_BRANCH_NAME
      ),
      installCommands: [
        "npm install -g aws-cdk",
        "yarn install --frozen-lockfile || npx projen && yarn install --frozen-lockfile",
      ],
      commands:
        commands && commands.length > 0
          ? commands
          : ["npx nx run-many --target=build --all"],
      primaryOutputDirectory: props.primarySynthDirectory,
      ...(synthShellStepPartialProps || {}),
    });

    synthShellStep.addOutputDirectory(".");

    const codePipelineProps: CodePipelineProps = {
      codePipeline,
      ...props,
      crossAccountKeys: undefined,
      synth: synthShellStep,
    };

    super(scope, id, codePipelineProps);

    this.id = id;
    this.codeRepository = codeRepository;
    this.sonarCodeScannerConfig = props.sonarCodeScannerConfig
      ? {
          cdkOutDir: props.primarySynthDirectory,
          ...props.sonarCodeScannerConfig,
        }
      : undefined;

    new CfnOutput(scope, "CodeRepositoryGRCUrl", {
      exportName: "CodeRepositoryGRCUrl",
      value: this.codeRepository.repositoryCloneUrlGrc,
    });
  }

  /**
   * @inheritDoc
   */
  addStage(stage: Stage, options?: AddStageOpts): StageDeployment {
    // Add any root Aspects to the stage level as currently this doesn't happen automatically
    Aspects.of(stage.node.root).all.forEach((aspect) =>
      Aspects.of(stage).add(aspect)
    );
    return super.addStage(stage, options);
  }

  buildPipeline() {
    super.buildPipeline();

    this.sonarCodeScannerConfig &&
      new SonarCodeScanner(this, "SonarCodeScanner", {
        artifactBucketArn: this.pipeline.artifactBucket.bucketArn,
        artifactBucketKeyArn:
          this.pipeline.artifactBucket.encryptionKey?.keyArn,
        synthBuildArn: this.synthProject.projectArn,
        ...this.sonarCodeScannerConfig,
      });

    this.suppressCDKViolations();
  }

  suppressCDKViolations() {
    const stack = Stack.of(this);

    ["AwsSolutions-IAM5", "AwsPrototyping-IAMNoWildcardPermissions"].forEach(
      (RuleId) => {
        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(
            stack
          )}CodePipeline/Role/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "Actions contain wildcards which are valid for CodePipeline as all of these operations are required.",
              appliesTo: [
                {
                  regex: "/^Action::s3:.*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
                {
                  regex: "/^Action::kms:ReEncrypt\\*$/g",
                },
                {
                  regex: "/^Action::kms:GenerateDataKey\\*$/g",
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(
            stack
          )}CodePipeline/Role/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "Actions contain wildcards which are valid for CodePipeline as all of these operations are required.",
              appliesTo: [
                {
                  regex: "/^Action::s3:.*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(
            stack
          )}CodePipeline/Source/CodeCommit/CodePipelineActionRole/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "Actions contain wildcards which are valid for CodePipeline as all of these operations are required.",
              appliesTo: [
                {
                  regex: "/^Action::s3:.*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
                {
                  regex: "/^Action::kms:ReEncrypt\\*$/g",
                },
                {
                  regex: "/^Action::kms:GenerateDataKey\\*$/g",
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(
            stack
          )}CodePipeline/Build/Synth/CdkBuildProject/Role/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "Actions contain wildcards which are valid for CodePipeline as all of these operations are required.",
              appliesTo: [
                {
                  regex: "/^Action::s3:.*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
                {
                  regex: "/^Action::kms:ReEncrypt\\*$/g",
                },
                {
                  regex: "/^Action::kms:GenerateDataKey\\*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to manage logs and streams whose names are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:logs:${PDKNag.getStackRegionRegex(
                    stack
                  )}:${PDKNag.getStackAccountRegex(
                    stack
                  )}:log-group:/aws/codebuild/<CodePipelineBuildSynthCdkBuildProject.*>:\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to create report groups that are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:codebuild:${PDKNag.getStackRegionRegex(
                    stack
                  )}:${PDKNag.getStackAccountRegex(
                    stack
                  )}:report-group/<CodePipelineBuildSynthCdkBuildProject.*>-\\*$/g`,
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(stack)}${
            this.id
          }/UpdatePipeline/SelfMutation/Role/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to manage logs and streams whose names are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:logs:${PDKNag.getStackRegionRegex(
                    stack
                  )}:${PDKNag.getStackAccountRegex(
                    stack
                  )}:log-group:/aws/codebuild/<${
                    this.id
                  }UpdatePipelineSelfMutation.*>:\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to create report groups that are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:codebuild:${PDKNag.getStackRegionRegex(
                    stack
                  )}:${PDKNag.getStackAccountRegex(stack)}:report-group/<${
                    this.id
                  }UpdatePipelineSelfMutation.*>-\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to assume a role from within the current account in order to deploy.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:\\*:iam::${PDKNag.getStackAccountRegex(
                    stack
                  )}:role/\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to list all buckets and stacks.",
              appliesTo: [
                {
                  regex: "/^Resource::\\*$/g",
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(stack)}${
            this.id
          }/UpdatePipeline/SelfMutation/Role/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason:
                "Actions contain wildcards which are valid for CodePipeline as all of these operations are required.",
              appliesTo: [
                {
                  regex: "/^Action::s3:.*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to manage logs and streams whose names are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:logs:${PDKNag.getStackRegionRegex(
                    stack
                  )}:(<AWS::AccountId>|${
                    stack.account
                  }):log-group:/aws/codebuild/<${
                    this.id
                  }UpdatePipelineSelfMutation.*>:\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to create report groups that are dynamically determined.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:${PDKNag.getStackPartitionRegex(
                    stack
                  )}:codebuild:${PDKNag.getStackRegionRegex(
                    stack
                  )}:${PDKNag.getStackAccountRegex(stack)}:report-group/<${
                    this.id
                  }UpdatePipelineSelfMutation.*>-\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to assume a role from within the current account in order to deploy.",
              appliesTo: [
                {
                  regex: `/^Resource::arn:\\*:iam::${PDKNag.getStackAccountRegex(
                    stack
                  )}:role/\\*$/g`,
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to any and all artifacts in the ArtifactsBucket.",
              appliesTo: [
                {
                  regex: "/^Resource::<ArtifactsBucket.*.Arn>/\\*$/g",
                },
                {
                  regex: "/^Action::kms:ReEncrypt\\*$/g",
                },
                {
                  regex: "/^Action::kms:GenerateDataKey\\*$/g",
                },
              ],
            },
            {
              id: RuleId,
              reason:
                "CodePipeline requires access to list all buckets and stacks.",
              appliesTo: [
                {
                  regex: "/^Resource::\\*$/g",
                },
              ],
            },
          ]
        );

        PDKNag.addResourceSuppressionsByPathNoThrow(
          stack,
          `${PDKNag.getStackPrefix(stack)}${
            this.id
          }/Assets/FileRole/DefaultPolicy/Resource`,
          [
            {
              id: RuleId,
              reason: "Asset role requires access to the Artifacts Bucket",
            },
          ]
        );
      }
    );

    [
      "AwsSolutions-CB4",
      "AwsPrototyping-CodeBuildProjectKMSEncryptedArtifacts",
    ].forEach((RuleId) => {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: RuleId,
          reason: "Encryption of Codebuild is not required.",
        },
      ]);
    });

    ["AwsSolutions-S1", "AwsPrototyping-S3BucketLoggingEnabled"].forEach(
      (RuleId) => {
        NagSuppressions.addStackSuppressions(stack, [
          {
            id: RuleId,
            reason: "Access Log buckets should not have s3 bucket logging",
          },
        ]);
      }
    );
  }
}
