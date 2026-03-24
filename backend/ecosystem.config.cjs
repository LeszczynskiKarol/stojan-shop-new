// backend/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "stojan-backend",
      script: "dist/index.js",
      cwd: "/home/ec2-user/stojan-shop-new/backend",
      interpreter: "node",
      node_args: "",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
