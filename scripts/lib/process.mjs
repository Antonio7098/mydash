import { spawn } from "node:child_process";

export function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (!options.inherit) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code: code ?? 1,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      if (result.code !== 0 && !options.allowFailure) {
        const details = result.stderr || result.stdout;
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with code ${result.code}` +
              (details ? `:\n${details}` : "."),
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}
