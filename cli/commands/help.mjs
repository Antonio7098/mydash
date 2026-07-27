import { commandRegistry } from "../registry.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";

export const helpCommand = {
  name: "help",
  summary: "Show CLI usage and command help.",
  usage: "mydash help [command]",
  options: [
    "--json       Return structured JSON.",
    "--workspace  Resolve a specific workspace root.",
  ],

  async run(invocation) {
    const requested = invocation.args[0] ?? null;

    if (requested) {
      const command = commandRegistry.get(requested);

      if (!command) {
        throw new CliError(
          "UNKNOWN_COMMAND",
          `Unknown command: ${requested}`,
          {
            exitCode: EXIT_USAGE,
            details: {
              availableCommands: commandRegistry.names(),
            },
          },
        );
      }

      return {
        ok: true,
        command: "help",
        data: commandHelpData(command),
        text: renderCommandHelp(command),
      };
    }

    const commands = commandRegistry.list();

    return {
      ok: true,
      command: "help",
      data: {
        name: "mydash",
        description:
          "Deterministic utilities for My Dashboards agents and technical users.",
        usage: "mydash <command> [options]",
        commands: commands.map((command) => ({
          name: command.name,
          summary: command.summary,
        })),
        globalOptions: [
          "--json",
          "--help, -h",
          "--version, -v",
          "--workspace <path>",
        ],
      },
      text: renderGeneralHelp(commands),
    };
  },
};

function commandHelpData(command) {
  return {
    name: command.name,
    summary: command.summary,
    usage: command.usage,
    options: command.options ?? [],
  };
}

function renderGeneralHelp(commands) {
  const commandLines = commands
    .map(
      (command) =>
        `  ${command.name.padEnd(10)} ${command.summary}`,
    )
    .join("\n");

  return `My Dashboards CLI

Deterministic utilities for My Dashboards agents and technical users.

Usage:
  mydash <command> [options]

Commands:
${commandLines}

Global options:
  --json               Return structured JSON.
  --workspace <path>   Resolve a specific workspace root.
  --help, -h           Show help.
  --version, -v        Show the CLI version.

Examples:
  mydash doctor
  mydash doctor --json
  mydash help doctor
`;
}

function renderCommandHelp(command) {
  const options =
    command.options?.length > 0
      ? `\nOptions:\n${command.options.map((value) => `  ${value}`).join("\n")}\n`
      : "";

  return `${command.name}

${command.summary}

Usage:
  ${command.usage}
${options}`;
}
