import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getRemoteUrl,
  validateRemoteUrl,
  type RemoteValidationResult,
  type GitOptions,
} from "../git";
import type { Logger } from "../logging";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

describe("remote validation (Gap 6: No Remote Validation)", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let gitOptions: GitOptions;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-remote-test-"));
    mockLogger = createMockLogger();
    gitOptions = {
      cwd: tempDir,
      logger: mockLogger,
      dryRun: false,
    };

    // Initialize git repo
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    await Bun.$`cd ${tempDir} && git init`.quiet();
    await Bun.$`cd ${tempDir} && git config user.email "test@test.com" && git config user.name "Test"`.quiet();
    await Bun.$`cd ${tempDir} && git add . && git commit -m "init"`.quiet();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("getRemoteUrl", () => {
    it("returns null when no remote is configured", async () => {
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBeNull();
    });

    it("returns null when remote does not exist", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/example/repo.git`.quiet();
      const url = await getRemoteUrl("upstream", gitOptions);
      expect(url).toBeNull();
    });

    it("returns HTTPS remote URL", async () => {
      const expectedUrl = "https://github.com/example/repo.git";
      await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBe(expectedUrl);
    });

    it("returns SSH remote URL", async () => {
      const expectedUrl = "git@github.com:example/repo.git";
      await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBe(expectedUrl);
    });

    it("returns Git protocol URL", async () => {
      const expectedUrl = "git://github.com/example/repo.git";
      await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBe(expectedUrl);
    });

    it("handles URLs with .git suffix", async () => {
      const expectedUrl = "https://github.com/example/repo.git";
      await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBe(expectedUrl);
    });

    it("handles URLs without .git suffix", async () => {
      const expectedUrl = "https://github.com/example/repo";
      await Bun.$`cd ${tempDir} && git remote add origin ${expectedUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      expect(url).toBe(expectedUrl);
    });

    it("returns push URL if different from fetch URL", async () => {
      const fetchUrl = "https://github.com/example/fetch.git";
      const pushUrl = "https://github.com/example/push.git";
      await Bun.$`cd ${tempDir} && git remote add origin ${fetchUrl}`.quiet();
      await Bun.$`cd ${tempDir} && git remote set-url --push origin ${pushUrl}`.quiet();
      const url = await getRemoteUrl("origin", gitOptions);
      // Should return push URL for validation purposes
      expect(url).toBe(pushUrl);
    });
  });

  describe("validateRemoteUrl", () => {
    it("passes when no patterns are configured", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/example/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", [], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.actualUrl).toBe("https://github.com/example/repo.git");
    });

    it("passes when URL matches allowed pattern", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/myrepo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.actualUrl).toBe("https://github.com/myorg/myrepo.git");
    });

    it("passes when URL matches multiple allowed patterns", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/repo.git`.quiet();

      const result = await validateRemoteUrl(
        "origin",
        ["github.com/myorg/", "github.com/otherorg/"],
        gitOptions
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes when SSH URL matches pattern", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin git@github.com:myorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes when HTTPS URL matches pattern", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails when URL does not match any allowed pattern", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/otherorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("does not match any allowed pattern");
      expect(result.actualUrl).toBe("https://github.com/otherorg/repo.git");
    });

    it("fails when remote points to different organization", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/evilorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("github.com/evilorg/");
    });

    it("fails when remote points to different host", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://gitlab.com/myorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("gitlab.com/myorg/");
    });

    it("handles wildcard patterns", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/anyorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes with exact repository match", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/specific-repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/specific-repo"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails when exact repository match differs", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/wrong-repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/specific-repo"], gitOptions);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("wrong-repo");
    });

    it("passes when URL ends with .git and pattern does not", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/repo"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes when URL lacks .git and pattern has it", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/myorg/repo`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/myorg/repo.git"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns actual URL even when validation fails", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/wrongorg/repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/correctorg/"], gitOptions);

      expect(result.valid).toBe(false);
      expect(result.actualUrl).toBe("https://github.com/wrongorg/repo.git");
    });

    it("handles patterns with special characters", async () => {
      await Bun.$`cd ${tempDir} && git remote add origin https://github.com/my-org/my_repo.git`.quiet();

      const result = await validateRemoteUrl("origin", ["github.com/my-org/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns valid result with null actual URL when remote does not exist", async () => {
      const result = await validateRemoteUrl("nonexistent", ["github.com/myorg/"], gitOptions);

      expect(result.valid).toBe(true);
      expect(result.actualUrl).toBeNull();
      expect(result.errors).toEqual([]);
    });
  });
});
