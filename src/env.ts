import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
  PUBLIC_MAPTILER_KEY: { public: true, schema: optional },
  CF_ACCESS_TEAM_DOMAIN: { schema: optional },
  CF_ACCESS_AUD: { schema: optional },
  CF_ACCESS_RBAC_ADMINS: { schema: optional },
  CF_ACCESS_RBAC_EDITORS: { schema: optional },
  CF_ACCESS_RBAC_ARCHIVERS: { schema: optional },
  EDITOR_TOKEN_AUTH_ENABLED: { schema: optional },
  EDITOR_API_TOKEN: { schema: optional },
  WRITE_RATE_LIMIT_ENABLED: { schema: optional },
});
