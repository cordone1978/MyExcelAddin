/* eslint-disable no-undef */

const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const urlDev = "https://localhost:3000/";
const urlProd = "https://www.contoso.com/";

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  const config = {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable", "regenerator-runtime/runtime"],
      taskpane: ["./src/taskpane/taskpane.ts", "./src/taskpane/taskpane.html"],
      dialog: ["./src/dialog/dialog.ts", "./src/dialog/dialog.html"],
      devmodify: ["./src/dialog/devmodify.ts", "./src/dialog/devmodify.html"],
      craftmodify: ["./src/dialog/craftmodify.ts", "./src/dialog/craftmodify.html"],
      commands: "./src/commands/commands.ts",
    },
    output: {
      filename: "[name].js",  // 确保输出文件名格式正确
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".html", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader"
          },
        },
        {
          test: /\.html$/,
          exclude: /node_modules/,
          use: "html-loader",
        },
        {
          test: /\.(png|jpg|jpeg|gif|ico)$/,
          type: "asset/resource",
          generator: {
            filename: "assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "dialog.html",
        template: "./src/dialog/dialog.html",
        chunks: ["dialog"],
      }),
      new HtmlWebpackPlugin({
        filename: "devmodify.html",
        template: "./src/dialog/devmodify.html",
        chunks: ["devmodify"],
      }),
      new HtmlWebpackPlugin({
        filename: "craftmodify.html",
        template: "./src/dialog/craftmodify.html",
        chunks: ["craftmodify"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["polyfill", "commands"],
        scriptLoading: "blocking",  // 添加这行
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "public/form2.html",
            to: "form2.html",
          },
          {
            from: "public/form3.html",
            to: "form3.html",
          },
          {
            from: "src/dialog/dialog.css",
            to: "dialog.css",
          },
          {
            from: "src/dialog/devmodify.css",
            to: "devmodify.css",
          },
          {
            from: "src/dialog/craftmodify.css",
            to: "craftmodify.css",
          },
          {
            from: "manifest*.xml",
            to: "[name]" + "[ext]",
            transform(content) {
              if (dev) {
                return content;
              } else {
                return content.toString().replace(new RegExp(urlDev, "g"), urlProd);
              }
            },
          },
        ],
      }),
    ],
    devServer: {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: {
        type: "https",
        options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await getHttpsOptions(),
      },
      port: process.env.npm_package_config_dev_server_port || 3000,
      client: {
        webSocketURL: "auto://0.0.0.0:0/ws",  // 自动检测正确的协议和主机
      },
    },
  };

  return config;
};
