/* eslint-disable no-undef */

const fs = require("fs");
const path = require("path");
const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const urlDev = "https://localhost:3000/";
const urlProd = "https://www.hnhtft.com.cn/";
const apiProxyTarget = process.env.QUOTATION_API_PROXY_TARGET || "https://localhost:3001";

async function getHttpsOptions() {
  const keyCandidates = [
    process.env.DEV_CERT_KEY_PATH,
    path.resolve(__dirname, "..", "localhost+2-key.pem"),
    path.resolve(__dirname, "localhost+2-key.pem"),
  ].filter(Boolean);
  const certCandidates = [
    process.env.DEV_CERT_PEM_PATH,
    process.env.DEV_CERT_CERT_PATH,
    path.resolve(__dirname, "..", "localhost+2.pem"),
    path.resolve(__dirname, "localhost+2.pem"),
  ].filter(Boolean);

  const keyPath = keyCandidates.find((p) => fs.existsSync(p));
  const certPath = certCandidates.find((p) => fs.existsSync(p));
  if (keyPath && certPath) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  const config = {
    devtool: "source-map",
    stats: "errors-warnings",
    entry: {
      polyfill: ["core-js/stable", "regenerator-runtime/runtime"],
      taskpane: ["./src/taskpane/taskpane.ts", "./src/taskpane/taskpane.html"],
      dialog: ["./src/dialog/dialog.ts", "./src/dialog/dialog.html"],
      devmodify: ["./src/dialog/devmodify.tsx", "./src/dialog/devmodify.html"],
      devmodifyv2: ["./src/dialog/devmodifyv2.tsx", "./src/dialog/devmodifyv2.html"],
      craftmodify: ["./src/dialog/craftmodify.ts", "./src/dialog/craftmodify.html"],
      queryprice: ["./src/dialog/queryprice.tsx", "./src/dialog/queryprice.html"],
      graphEditor: ["./src/graph-editor/graphEditor.tsx", "./src/graph-editor/graphEditor.html"],
      infoReference: ["./src/info-reference/infoReference.tsx", "./src/info-reference/infoReference.html"],
      quoteSummaryPreview: ["./src/quote-preview/quoteSummaryPreview.ts", "./src/quote-preview/quoteSummaryPreview.html"],
      commands: "./src/commands/commands.ts",
    },
    output: {
      filename: "[name].js",  // 确保输出文件名格式正确
      chunkFilename: "[name].js",
      clean: true,
    },
    optimization: {
      splitChunks: {
        chunks: "all",
        cacheGroups: {
          reactVendor: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: "react-vendor",
            chunks: "all",
            priority: 30,
          },
          konvaVendor: {
            test: /[\\/]node_modules[\\/](react-konva|konva|react-reconciler|its-fine)[\\/]/,
            name: "konva-vendor",
            chunks: "all",
            priority: 20,
          },
        },
      },
    },
    resolve: {
      extensions: [".tsx", ".ts", ".html", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
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
        chunks: ["polyfill", "dialog"],
      }),
      new HtmlWebpackPlugin({
        filename: "devmodify.html",
        template: "./src/dialog/devmodify.html",
        chunks: ["polyfill", "devmodify"],
      }),
      new HtmlWebpackPlugin({
        filename: "devmodifyv2.html",
        template: "./src/dialog/devmodifyv2.html",
        chunks: ["polyfill", "devmodifyv2"],
      }),
      new HtmlWebpackPlugin({
        filename: "craftmodify.html",
        template: "./src/dialog/craftmodify.html",
        chunks: ["polyfill", "craftmodify"],
      }),
      new HtmlWebpackPlugin({
        filename: "queryprice.html",
        template: "./src/dialog/queryprice.html",
        chunks: ["polyfill", "queryprice"],
      }),
      new HtmlWebpackPlugin({
        filename: "graphEditor.html",
        template: "./src/graph-editor/graphEditor.html",
        chunks: ["polyfill", "graphEditor"],
      }),
      new HtmlWebpackPlugin({
        filename: "infoReference.html",
        template: "./src/info-reference/infoReference.html",
        chunks: ["polyfill", "infoReference"],
      }),
      new HtmlWebpackPlugin({
        filename: "quoteSummaryPreview.html",
        template: "./src/quote-preview/quoteSummaryPreview.html",
        chunks: ["polyfill", "quoteSummaryPreview"],
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
            from: "assets/equipment",
            to: "assets/equipment",
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
            from: "src/dialog/devmodifyv2.css",
            to: "devmodifyv2.css",
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
        logging: "warn",
      },
      devMiddleware: {
        stats: "errors-warnings",
      },
    },
  };

  return config;
};
