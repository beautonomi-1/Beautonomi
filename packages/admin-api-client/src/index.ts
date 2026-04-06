export {
  ADMIN_SCOPE_STORAGE_KEY,
  ADMIN_SCOPE_TENANT_STORAGE_KEY,
  SCOPED_ADMIN_PATH_PREFIXES,
  isScopedAdminCustomizationPath,
  readAdminScopeFromStorage,
  withAdminScopeUrl,
} from "./adminScope";
export { createAdminApiClient, type AdminApiClient, type AdminApiClientOptions } from "./createAdminApiClient";
export { AdminApiError, isUnauthorizedStatus, isForbiddenStatus } from "./errors";
export {
  adminBootstrapSchema,
  adminBootstrapUserSchema,
  type AdminBootstrap,
} from "./schemas/bootstrap";
