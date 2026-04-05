/** Shape of GET /api/public/providers/[slug]/services → data.categories items */
export type PartnerProfileServiceCategoryInitial = {
  id: string;
  name: string;
  services: Record<string, unknown>[];
};
