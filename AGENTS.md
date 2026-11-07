# Project conventions
- Keep explorer RPC upstreams in the existing PostgreSQL node catalog, managed through authenticated runtime node settings; browser requests use the API proxy so saved changes apply without rebuilding.
- Run the root production build directly through Vite and emit workspace-root dist; recursive workspace scripts can break Bun builds.
- The development API proxy defaults to the hosted service; API_SERVER_URL or API_PROXY_TARGET selects a local self-hosted API without proxying back into Vite itself.