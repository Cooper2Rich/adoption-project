export const PUBLIC_DEMO = import.meta.env.MODE === "public";
export const APP_NAME = "adoption.is";
export const demoAsset = (path: string) => {
  // Refresh cached WebM files after repairing the sample videos' seek indexes.
  const revision = path.endsWith(".webm") ? "?v=20261024" : "";
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}${revision}`;
};
