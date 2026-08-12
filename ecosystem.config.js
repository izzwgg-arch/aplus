module.exports = {
  apps: [
    {
      name: "aba-app",
      cwd: "/opt/aba",
      script: "node",
      args: "server/src/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
