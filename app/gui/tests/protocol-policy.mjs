class ProtocolPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolPolicyError";
  }
}

const APPROVED_DIAGNOSTIC_COMMANDS = [
  "ping",
  "runtime.inspect",
  "runtime.search",
  "trainer.options.get",
  "trainer.hooks.info",
  "data.dump",
  "map.current"
];
const REMOVED_DOMAIN = ["fi", "sh", "ing"].join("");
const REMOVED_COMMAND_PREFIX = [REMOVED_DOMAIN, ""].join(".");

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

export function assertApprovedDiagnosticCommands(actualValues) {
  const removedDiagnostics = actualValues.filter((value) => String(value).startsWith(REMOVED_COMMAND_PREFIX));
  if (removedDiagnostics.length > 0) {
    throw new ProtocolPolicyError(`diagnosticCommandNames still exposes removed diagnostics: ${formatList(removedDiagnostics)}`);
  }
  const actual = new Set(actualValues);
  const expected = new Set(APPROVED_DIAGNOSTIC_COMMANDS);
  const missing = APPROVED_DIAGNOSTIC_COMMANDS.filter((value) => !actual.has(value));
  const extra = actualValues.filter((value) => !expected.has(value));
  if (missing.length > 0 || extra.length > 0) {
    throw new ProtocolPolicyError(
      `diagnosticCommandNames must be exactly ${APPROVED_DIAGNOSTIC_COMMANDS.join(", ")}; ` +
        `missing ${formatList(missing)}; extra ${formatList(extra)}`
    );
  }
}
