export default () => ({
  registryUrl: process.env.REGISTRY_URL,
  localRegistryHost: process.env.LOCAL_REGISTRY_HOST ?? "localhost:5001",
  localRegistryCluster:
    process.env.LOCAL_REGISTRY_CLUSTER ?? "kind-registry:5000",
  buildpackBuilderImage:
    process.env.BUILDPACK_BUILDER_IMAGE ?? "gcr.io/buildpacks/builder",
  buildpackRunnerImage:
    process.env.BUILDPACK_RUNNER_IMAGE ??
    "ghcr.io/venumigihansa/nexcause-buildpack-runner:0.1.0",
});
