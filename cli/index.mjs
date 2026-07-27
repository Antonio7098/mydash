import { createCommandContext } from "./runtime.mjs";
import { commandRegistry } from "./registry.mjs";
import {
  EXIT_OPERATION_FAILED,
  EXIT_SUCCESS,
  EXIT_USAGE,
  CliError,
  normaliseError,
} from "./errors.mjs";
import { parseInvocation } from "./parser.mjs";
import { writeError, writeResult } from "./output.mjs";

export async function runCli(argv, runtime = {}) {
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

function safelyReadJsonFlag(argv) {
  return argv.includes("--json");
}
