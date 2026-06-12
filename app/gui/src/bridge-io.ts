namespace NwrGuiBridgeIO {
  export type BridgeCommand = {
    readonly type: string;
    readonly [key: string]: unknown;
  };

  export type QueuedBridgeCommand = BridgeCommand & {
    readonly commandId: string;
    readonly ts: number;
  };

  export type BridgePaths = {
    readonly bridgeDir: string;
    readonly commandPath: string;
    readonly eventPath: string;
    readonly statePath: string;
  };

  export type PathAdapter = {
    readonly join: (...segments: readonly string[]) => string;
  };

  export type FileSystemAdapter = {
    readonly existsSync: (filePath: string) => boolean;
    readonly mkdirSync: (filePath: string, options: { readonly recursive: true }) => void;
    readonly readFileSync: (filePath: string, encoding: "utf8") => string;
    readonly appendFileSync: (filePath: string, data: string, encoding: "utf8") => void;
    readonly writeFileSync: (filePath: string, data: string, encoding: "utf8") => void;
    readonly statSync: (filePath: string) => { readonly size: number };
  };

  export function createBridgePaths(pathAdapter: PathAdapter, projectRoot: string): BridgePaths {
    const bridgeDir = pathAdapter.join(projectRoot, "runtime", "bridge-state");
    return {
      bridgeDir,
      commandPath: pathAdapter.join(bridgeDir, "commands.jsonl"),
      eventPath: pathAdapter.join(bridgeDir, "events.jsonl"),
      statePath: pathAdapter.join(bridgeDir, "state.json")
    };
  }

  export function ensureBridgeDir(fsAdapter: FileSystemAdapter, paths: BridgePaths): void {
    fsAdapter.mkdirSync(paths.bridgeDir, { recursive: true });
  }

  export function sendCommand(
    fsAdapter: FileSystemAdapter,
    paths: BridgePaths,
    command: BridgeCommand,
    now: () => number = Date.now,
    random: () => number = Math.random
  ): QueuedBridgeCommand {
    ensureBridgeDir(fsAdapter, paths);
    const payload = {
      ...command,
      commandId: `${now()}-${random().toString(16).slice(2)}`,
      ts: now()
    };
    fsAdapter.appendFileSync(paths.commandPath, `${JSON.stringify(payload)}\n`, "utf8");
    return payload;
  }

  export function clearEvents(fsAdapter: FileSystemAdapter, paths: BridgePaths): void {
    ensureBridgeDir(fsAdapter, paths);
    fsAdapter.writeFileSync(paths.eventPath, "", "utf8");
  }

  export function readEvents(fsAdapter: FileSystemAdapter, paths: BridgePaths): readonly unknown[] {
    try {
      if (!fsAdapter.existsSync(paths.eventPath)) return [];
      const text = fsAdapter.readFileSync(paths.eventPath, "utf8").trim();
      if (!text) return [];
      return text.split(/\r?\n/).flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch (error) {
          if (error instanceof SyntaxError) return [];
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof Error) return [];
      throw error;
    }
  }

  export function eventSize(fsAdapter: FileSystemAdapter, paths: BridgePaths): number {
    return fsAdapter.existsSync(paths.eventPath) ? fsAdapter.statSync(paths.eventPath).size : 0;
  }
}
