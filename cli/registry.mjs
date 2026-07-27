import { helpCommand } from "./commands/help.mjs";
import { versionCommand } from "./commands/version.mjs";
import { doctorCommand } from "./commands/doctor.mjs";
import { inspectCommand } from "./commands/inspect.mjs";
import { fileCommand } from "./commands/file.mjs";
import { excelCommand } from "./commands/excel.mjs";
import { powerpointCommand } from "./commands/powerpoint.mjs";
import { dataCommand } from "./commands/data.mjs";
import { libraryCommand } from "./commands/library.mjs";
import { appearanceCommand } from "./commands/appearance.mjs";
import { artifactCommand } from "./commands/artifact.mjs";
import { validateCommand } from "./commands/validate.mjs";
import { impactCommand } from "./commands/impact.mjs";
import { gitCommand } from "./commands/git.mjs";
import { skillsCommand } from "./commands/skills.mjs";

const commands = [
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

const commandMap = new Map(
  commands.map((command) => [command.name, command]),
);

export const commandRegistry = {
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
