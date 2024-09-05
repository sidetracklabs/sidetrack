const path = require("path");
const { resolveType } = require("kanel");

/** @type {import('kanel').Config} */
module.exports = {
  connection: { connectionString: process.env.DATABASE_URL },
  generateIdentifierType: (c, d, config) => {
    // Id columns are already prefixed with the table name, so we don't need to add it here
    const name = "Id";
    const innerType = resolveType(c, d, {
      ...config,
      generateIdentifierType: undefined,
    });
    return {
      comment: [],
      declarationType: "typeDeclaration",
      exportAs: "named",
      name,
      typeDefinition: [innerType],
    };
  },
  outputPath: "./src/models/generated",
  preDeleteOutputFolder: true,
  //   customTypeMap: {
  //     "pg_catalog.tsvector": "string",
  //     "pg_catalog.bpchar": "string",
  //   },
};
