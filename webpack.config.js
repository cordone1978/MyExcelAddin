/* eslint-disable no-undef */

const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const urlDev = "https://localhost:3000/";
const urlProd = "https://www.hnhtft.com.cn/";
const apiProxyTarget = process.env.QUOTATION_API_PROXY_TARGET || "https://localhost:3001";

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
      queryprice: ["./src/dialog/queryprice.ts", "./src/dialog/queryprice.html"],
      graphEditor: ["./src/graph-editor/graphEditor.ts", "./src/graph-editor/graphEditor.html"],
      infoReference: ["./src/info-reference/infoReference.ts", "./src/info-reference/infoReference.html"],
      quoteSummaryPreview: ["./src/quote-preview/quoteSummaryPreview.ts", "./src/quote-preview/quoteSummaryPreview.html"],
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
        filename: "queryprice.html",
        template: "./src/dialog/queryprice.html",
        chunks: ["queryprice"],
      }),
      new HtmlWebpackPlugin({
        filename: "graphEditor.html",
        template: "./src/graph-editor/graphEditor.html",
        chunks: ["graphEditor"],
      }),
      new HtmlWebpackPlugin({
        filename: "infoReference.html",
        template: "./src/info-reference/infoReference.html",
        chunks: ["infoReference"],
      }),
      new HtmlWebpackPlugin({
        filename: "quoteSummaryPreview.html",
        template: "./src/quote-preview/quoteSummaryPreview.html",
        chunks: ["quoteSummaryPreview"],
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
            from: "src/dialog/queryprice.css",
            to: "queryprice.css",
          },
          {
            from: "src/graph-editor/graphEditor.css",
            to: "graphEditor.css",
          },
          {
            from: "src/info-reference/infoReference.css",
            to: "infoReference.css",
          },
          {
            from: "src/quote-preview/quoteSummaryPreview.css",
            to: "quoteSummaryPreview.css",
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
      proxy: [
        {
          context: ["/api", "/public"],
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      ],
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
