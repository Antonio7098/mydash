import { helpCommand } from "./commands/help.js";
import { versionCommand } from "./commands/version.js";
import { doctorCommand } from "./commands/doctor.js";
import { inspectCommand } from "./commands/inspect.js";
import { fileCommand } from "./commands/file.js";
import { excelCommand } from "./commands/excel.js";
import { powerpointCommand } from "./commands/powerpoint.js";
import { dataCommand } from "./commands/data.js";
import { libraryCommand } from "./commands/library.js";
import { appearanceCommand } from "./commands/appearance.js";
import { artifactCommand } from "./commands/artifact.js";
import { validateCommand } from "./commands/validate.js";
import { impactCommand } from "./commands/impact.js";
import { gitCommand } from "./commands/git.js";
import { skillsCommand } from "./commands/skills.js";
import type { CommandDefinition, CommandRegistry } from "./types.js";

const commands: CommandDefinition[] = [
  helpCommand,
  versionCommand,
  doctorCommand,
  inspectCommand,
  fileCommand,
  excelCommand,
  powerpointCommand,
  dataCommand,
  libraryCommand,
  appearanceCommand,
  artifactCommand,
  validateCommand,
  impactCommand,
  gitCommand,
  skillsCommand,
];

const commandMap = new Map<string, CommandDefinition>(
  commands.map((command) => [command.name, command]),
);

export const commandRegistry: CommandRegistry = {
  get(name) {
    return commandMap.get(name) ?? null;
  },

  list() {
    return [...commands];
  },

  names() {
    return commands.map((command) => command.name);
  },
};
