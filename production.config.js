// BIDEX_NODE pins which node binary PM2 launches these apps with. The live
// server keeps a different version as its system default (another app runs
// there), so the deploy exports this to the node the app was actually built
// against. Unset locally, PM2 just uses whatever `node` is on PATH.
const interpreter = process.env.BIDEX_NODE || "node";

module.exports = {
  apps: [
    {
      name: "bidex-backend",
      interpreter,
      script: "./backend/dist/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      exec_mode: "fork",
      instances: 1,
    },
    {
      name: "bidex-frontend",
      interpreter,
      script: "./frontend/node_modules/next/dist/bin/next",
      args: "start",
      cwd: "./frontend",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXT_PUBLIC_SITE_URL: "https://terminal.web-bytes.in",
        NEXT_PUBLIC_BACKEND_PORT: "4000",
        NEXT_PUBLIC_FRONTEND_PORT: "3000",
        NEXT_PUBLIC_SITE_NAME: "BIDEX",
        NEXT_PUBLIC_SITE_DESCRIPTION: "BIDEX Exchange Platform",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXT_PUBLIC_SITE_URL: "https://terminal.web-bytes.in",
        NEXT_PUBLIC_BACKEND_PORT: "4000", 
        NEXT_PUBLIC_FRONTEND_PORT: "3000",
        NEXT_PUBLIC_SITE_NAME: "BIDEX",
        NEXT_PUBLIC_SITE_DESCRIPTION: "BIDEX Exchange Platform",
      },
      exec_mode: "fork",
      instances: 1,
    },
  ],
};
