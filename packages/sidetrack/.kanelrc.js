const path = require("path");
const { resolveType } = require("kanel");

/** @type {import('kanel').Config} */
module.exports = {
  connection: { connectionString: process.env.DATABASE_URL },
  preDeleteOutputFolder: true,
  outputPath: "./src/models/generated",
  generateIdentifierType: (c, d, config) => {
    // Id columns are already prefixed with the table name, so we don't need to add it here
    const name = "Id";
    const innerType = resolveType(c, d, {
      ...config,
      generateIdentifierType: undefined,
    });
    return {
      declarationType: "typeDeclaration",
      name,
      exportAs: "named",
      typeDefinition: [innerType],
      comment: [],
    };
  },
  //   customTypeMap: {
  //     "pg_catalog.tsvector": "string",
  //     "pg_catalog.bpchar": "string",
  //   },
};
