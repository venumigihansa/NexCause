import * as k8s from '@kubernetes/client-node';

interface BuildJobManifestInput {
  name: string;
  labels: Record<string, string>;
  repoUrl: string;
  branch: string;
  buildContext: string;
  dockerfilePath: string;
  clusterImage: string;
}

export function buildBuildJobManifest({
  name,
  labels,
  repoUrl,
  branch,
  buildContext,
  dockerfilePath,
  clusterImage,
}: BuildJobManifestInput): k8s.V1Job {
  const dockerfileDir = getDirectoryName(dockerfilePath);
  const dockerfileName = getBaseName(dockerfilePath);

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name,
      labels,
    },
    spec: {
      backoffLimit: 0,
      template: {
        metadata: {
          labels,
        },
        spec: {
          restartPolicy: 'Never',
          volumes: [
            {
              name: 'workspace',
              emptyDir: {},
            },
          ],
          initContainers: [
            {
              name: 'clone-repo',
              image: 'alpine/git:2.45.2',
              args: [
                'clone',
                '--depth',
                '1',
                '--branch',
                branch,
                repoUrl,
                '/workspace/repo',
              ],
              volumeMounts: [
                {
                  name: 'workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],
          containers: [
            {
              name: 'build-and-push',
              image: 'moby/buildkit:buildx-stable-1',
              securityContext: {
                privileged: true,
              },
              command: ['/bin/sh', '-c'],
              args: [
                [
                  'set -eu',
                  [
                    'buildctl-daemonless.sh build',
                    '--frontend dockerfile.v0',
                    `--local context=/workspace/repo/${trimPath(buildContext)}`,
                    `--local dockerfile=/workspace/repo/${trimPath(dockerfileDir)}`,
                    `--opt filename=${dockerfileName}`,
                    `--output type=image,name=${clusterImage},push=true,registry.insecure=true`,
                  ].join(' '),
                ].join('\n'),
              ],
              volumeMounts: [
                {
                  name: 'workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function getDirectoryName(path: string): string {
  const normalized = trimPath(path);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) {
    return '.';
  }

  return normalized.slice(0, lastSlash) || '.';
}

function getBaseName(path: string): string {
  const normalized = trimPath(path);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) {
    return normalized;
  }

  return normalized.slice(lastSlash + 1);
}

function trimPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '') || '.';
}
