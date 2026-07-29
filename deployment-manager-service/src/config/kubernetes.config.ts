export default () => ({
  defaultNamespace: process.env.DEFAULT_KUBERNETES_NAMESPACE ?? "apps",
});
