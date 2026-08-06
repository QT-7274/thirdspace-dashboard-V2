type AcaiFeatureProgress = {
  completed_count: number;
  total_count: number;
};

type AcaiImplementationProgress = {
  features: { features: AcaiFeatureProgress[] } | null;
};

export function partitionAcaiImplementations<T extends AcaiImplementationProgress>(items: T[]): {
  current: T[];
  completed: T[];
} {
  const current: T[] = [];
  const completed: T[] = [];

  for (const item of items) {
    const features = item.features?.features;
    if (!features || features.length === 0) continue;

    const totalAcids = features.reduce((sum, feature) => sum + feature.total_count, 0);
    const completedAcids = features.reduce((sum, feature) => sum + feature.completed_count, 0);
    if (totalAcids > 0 && completedAcids === totalAcids) completed.push(item);
    else current.push(item);
  }

  return { current, completed };
}
