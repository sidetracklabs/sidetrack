module.exports = {
  // JSON prettier plugin
  jsonRecursiveSort: true,
  // This has to be done because of pnpm
  plugins: [require.resolve("prettier-plugin-sort-json")],
};
