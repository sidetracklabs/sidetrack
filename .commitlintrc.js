// Default template copied from: https://cz-git.qbb.sh/config/

const { execSync } = require("child_process");

// Get the list of affected projects
const turboOutput = execSync("npx turbo run build --filter=[HEAD^1] --dry=json")
  .toString()
  .trim();

const scopes = JSON.parse(turboOutput)
  .tasks.filter((task) => task.task === "build")
  .map((task) => task.package);

/** @type {import('cz-git').UserConfig} */
module.exports = {
  prompt: {
    aiNumber: 1,
    allowBreakingChanges: ["feat", "fix"],
    allowCustomIssuePrefix: true,
    allowCustomScopes: true,
    allowEmptyIssuePrefix: true,
    allowEmptyScopes: true,
    breaklineChar: "|",
    breaklineNumber: 100,
    confirmColorize: true,
    customIssuePrefixAlias: "custom",
    customIssuePrefixAlign: "top",
    customScopesAlias: "custom",
    customScopesAlign: "top",
    defaultBody: "",
    defaultIssues: "",
    defaultScope: "",
    defaultSubject: "",
    emojiAlign: "center",
    emptyIssuePrefixAlias: "skip",
    emptyScopesAlias: "empty",
    issuePrefixes: [
      { name: "closed:   ISSUES has been processed", value: "closed" },
    ],
    markBreakingChangeMode: false,
    maxHeaderLength: 120,
    maxSubjectLength: Infinity,
    // alias: { fd: "docs: fix typos" },
    messages: {
      body: 'Provide a LONGER description of the change (optional). Use "|" to break new line:\n',
      breaking:
        'List any BREAKING CHANGES (optional). Use "|" to break new line:\n',
      confirmCommit: "Are you sure you want to proceed with the commit above?",
      customFooterPrefix: "Input ISSUES prefix:",
      customScope: "Denote the SCOPE of this change:",
      footer: "List any ISSUES by this change. E.g.: #31, #34:\n",
      footerPrefixSelect:
        "Select the ISSUES type of changeList by this change (optional):",
      generatedSelectByAI: "Select suitable subject by AI generated:",
      generatingByAI: "Generating your AI commit subject...",
      scope: "Denote the SCOPE of this change (optional):",
      subject: "Write a SHORT, IMPERATIVE tense description of the change:\n",
      type: "Select the type of change that you're committing:",
    },
    minSubjectLength: 0,
    scopeOverrides: undefined,
    scopes,
    skipQuestions: [],
    themeColorCode: "",
    types: [
      { emoji: ":sparkles:", name: "feat:     A new feature", value: "feat" },
      { emoji: ":bug:", name: "fix:      A bug fix", value: "fix" },
      {
        emoji: ":memo:",
        name: "docs:     Documentation only changes",
        value: "docs",
      },
      {
        emoji: ":lipstick:",
        name: "style:    Changes that do not affect the meaning of the code",
        value: "style",
      },
      {
        emoji: ":recycle:",
        name: "refactor: A code change that neither fixes a bug nor adds a feature",
        value: "refactor",
      },
      {
        emoji: ":zap:",
        name: "perf:     A code change that improves performance",
        value: "perf",
      },
      {
        emoji: ":white_check_mark:",
        name: "test:     Adding missing tests or correcting existing tests",
        value: "test",
      },
      {
        emoji: ":package:",
        name: "build:    Changes that affect the build system or external dependencies",
        value: "build",
      },
      {
        emoji: ":ferris_wheel:",
        name: "ci:       Changes to our CI configuration files and scripts",
        value: "ci",
      },
      {
        emoji: ":hammer:",
        name: "chore:    Other changes that don't modify src or test files",
        value: "chore",
      },
      {
        emoji: ":rewind:",
        name: "revert:   Reverts a previous commit",
        value: "revert",
      },
    ],
    upperCaseSubject: false,
    useAI: false,
    useEmoji: false,
  },
  // I'm just putting something in here because this rules key can't be empty
  // If you see red underline in the rules object, make sure it's not "LintLens", that's just a false positive from ESLint VSCode extension
  rules: {
    // @see: https://commitlint.js.org/#/reference-rules
    "header-max-length": [2, "always", 120],
    "scope-case": [0],
    "subject-case": [0],
  },
};
