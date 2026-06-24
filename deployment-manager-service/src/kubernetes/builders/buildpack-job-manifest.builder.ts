import * as k8s from '@kubernetes/client-node';

interface BuildpackJobManifestInput {
  name: string;
  labels: Record<string, string>;
  repoUrl: string;
  branch: string;
  buildContext: string;
  clusterImage: string;
  builderImage: string;
  runnerImage: string;
  insecureRegistry: string;
}

export function buildBuildpackJobManifest({
  name,
  labels,
  repoUrl,
  branch,
  buildContext,
  clusterImage,
  builderImage,
  runnerImage,
  insecureRegistry,
}: BuildpackJobManifestInput): k8s.V1Job {
  const appPath = `/workspace/repo/${trimPath(buildContext)}`;

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
              image: runnerImage,
              securityContext: {
                privileged: true,
              },
              command: ['/bin/sh', '-c'],
              args: [
                [
                  'set -eu',
                  [
                    'dockerd-entrypoint.sh dockerd',
                    '--host=unix:///var/run/docker.sock',
                    `--insecure-registry=${insecureRegistry}`,
                    '> /tmp/dockerd.log 2>&1 &',
                  ].join(' '),
                  'for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done',
                  'docker info',
                  `pack build ${clusterImage} --path ${appPath} --builder ${builderImage} --network host`,
                  `docker push ${clusterImage}`,
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

function trimPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '') || '.';
}
