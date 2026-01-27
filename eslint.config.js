const js = require("@eslint/js");
const jsdoc = require("eslint-plugin-jsdoc");

module.exports = [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    plugins: {
      jsdoc: jsdoc,
    },
    rules: {
      "jsdoc/valid-types": "error", // This will find the "/" syntax error
      "jsdoc/check-types": "error",
      "jsdoc/no-undefined-types": "warn",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
        preferredTypes: {
            "ArrayLike": "ArrayLike"
        }
      },
    },
  },
];
