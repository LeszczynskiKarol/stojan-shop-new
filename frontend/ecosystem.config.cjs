// frontend/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "stojan-frontend",
      script: "dist/server/entry.mjs",
      cwd: "/home/ec2-user/stojan-shop-new/frontend",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
