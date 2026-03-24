// backend/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "stojan-backend",
      script: "dist/index.js",
      cwd: "/home/ec2-user/stojan-shop-new/backend",
      interpreter: "/home/ec2-user/.nvm/versions/node/v20.20.0/bin/node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
