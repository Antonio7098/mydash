import { createCommandContext } from "./runtime.js";
import type { CommandRuntimeOverrides } from "./runtime.js";
import { commandRegistry } from "./registry.js";
import {
  EXIT_OPERATION_FAILED,
  EXIT_SUCCESS,
  EXIT_USAGE,
  CliError,
  normaliseError,
} from "./errors.js";
import { parseInvocation } from "./parser.js";
import { writeError, writeResult } from "./output.js";

export async function runCli(
  argv: readonly string[],
  runtime: CommandRuntimeOverrides = {},
): Promise<number> {
  const context = createCommandContext(runtime);

  try {
    const invocation = parseInvocation(argv);

    if (invocation.versionRequested) {
      invocation.commandName = "version";
    }

    if (invocation.helpRequested && !invocation.commandName) {
      invocation.commandName = "help";
    }

    if (!invocation.commandName) {
      invocation.commandName = "help";
    }

    const command = commandRegistry.get(invocation.commandName);

    if (!command) {
      throw new CliError(
        "UNKNOWN_COMMAND",
        `Unknown command: ${invocation.commandName}`,
        {
          exitCode: EXIT_USAGE,
          details: {
            availableCommands: commandRegistry.names(),
          },
          hint: "Run `mydash help` to list available commands.",
        },
      );
    }

    if (invocation.helpRequested && invocation.commandName !== "help") {
      const helpCommand = commandRegistry.get("help");
      if (!helpCommand) {
        throw new Error("Help command is not registered.");
      }
      const result = await helpCommand.run(
        {
          args: [invocation.commandName],
          options: invocation.options,
        },
        context,
      );

      writeResult(result, {
        json: invocation.json,
        stdout: context.stdout,
      });

      return EXIT_SUCCESS;
    }

    const result = await command.run(
      {
        args: invocation.args,
        options: invocation.options,
        json: invocation.json,
      },
      context,
    );

    writeResult(result, {
      json: invocation.json,
      stdout: context.stdout,
    });

    return result?.exitCode ?? EXIT_SUCCESS;
  } catch (error) {
    const normalised = normaliseError(error);

    writeError(normalised, {
      json: Boolean(safelyReadJsonFlag(argv)),
      stderr: context.stderr,
    });

    return normalised.exitCode ?? EXIT_OPERATION_FAILED;
  }
}

function safelyReadJsonFlag(argv: readonly string[]): boolean {
  return argv.includes("--json");
}
