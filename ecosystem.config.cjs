module.exports = {
  apps: [
    {
      name: "splitledger-api",
      cwd: __dirname,
      script: "apps/api/dist/index.js",
      instances: 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      kill_timeout: 10000,
      listen_timeout: 10000,
      merge_logs: true,
      time: true,
      autorestart: true,
    },
  ],
};
