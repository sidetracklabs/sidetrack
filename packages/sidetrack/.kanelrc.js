const { defaultGenerateIdentifierType } = require("kanel");
/** @type {import('kanel').Config} */
module.exports = {
  connection: { connectionString: process.env.DATABASE_URL },
  //   customTypeMap: {
  //     "pg_catalog.tsvector": "string",
  //     "pg_catalog.bpchar": "string",
  //   },
  enumStyle: "type",
  generateIdentifierType: (c, d, config) => {
    const defaultResult = defaultGenerateIdentifierType(c, d, config);
    // Remove the brand from the type definition
    defaultResult.typeDefinition = [
      defaultResult.typeDefinition[0].split(" & ")[0],
    ];
    return defaultResult;
  },
  outputPath: "./src/models/generated",
  preDeleteOutputFolder: true,
};
