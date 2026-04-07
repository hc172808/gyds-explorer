/**
 * PM2 Ecosystem Configuration for GYDS Explorer
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only gyds-api
 *   pm2 start ecosystem.config.js --only gyds-feature-gates
 */

module.exports = {
  apps: [
    {
      name: "gyds-api",
      script: "./api/server.js",
      cwd: "/var/www/gyds-explorer",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/gyds-api-error.log",
      out_file: "/var/log/pm2/gyds-api-out.log",
      time: true,
    },
    {
      name: "gyds-indexer",
      script: "./indexer/indexer.js",
      cwd: "/var/www/gyds-explorer",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/gyds-indexer-error.log",
      out_file: "/var/log/pm2/gyds-indexer-out.log",
      time: true,
    },
    {
      name: "gyds-feature-gates",
      script: "./feature-gate-service/server.js",
      cwd: "/var/www/gyds-explorer",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "128M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/gyds-feature-gates-error.log",
      out_file: "/var/log/pm2/gyds-feature-gates-out.log",
      time: true,
    },
  ],
};
