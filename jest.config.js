export default {
  testMatch: [
    "**/tests/?(*.)+(spec|test).[jt]s?(x)"
  ],

  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
  },

};