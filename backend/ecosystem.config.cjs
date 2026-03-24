// backend/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "stojan-backend",
      script: "dist/index.js",
      cwd: "/home/ec2-user/stojan-shop-new/backend",
      env: {
        NODE_ENV: "production",
        NODE_PATH: "/home/ec2-user/stojan-shop-new/backend/node_modules",
      },
    },
  ],
};
