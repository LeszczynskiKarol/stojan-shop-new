/**
 * backend/src/services/rebuild-satellite.ts
 *
 * Triggeruje przebudowę silnik-elektryczny.pl
 * Wywołuje CodeBuild bezpośrednio przez AWS SDK (bez pośredniej Lambdy)
 *
 * EC2 musi mieć IAM role z uprawnieniem codebuild:StartBuild
 */

let lastTrigger = 0;
const MIN_INTERVAL_MS = 120_000; // 2 min debounce

export function fireSatelliteRebuild(reason: string, productSlug?: string) {
  const now = Date.now();
  if (now - lastTrigger < MIN_INTERVAL_MS) {
    console.log(
      `[satellite-rebuild] Skipped (${Math.round((now - lastTrigger) / 1000)}s since last)`,
    );
    return;
  }
  lastTrigger = now;

  // Fire and forget
  (async () => {
    try {
      const {
        CodeBuildClient,
        StartBuildCommand,
        ListBuildsForProjectCommand,
        BatchGetBuildsCommand,
      } = await import("@aws-sdk/client-codebuild");
      const client = new CodeBuildClient({ region: "eu-north-1" });
      const PROJECT = "silnik-elektryczny-pl";

      // Debounce: sprawdź czy build nie trwa
      const list = await client.send(
        new ListBuildsForProjectCommand({
          projectName: PROJECT,
          sortOrder: "DESCENDING",
        }),
      );
      if (list.ids?.length) {
        const latest = await client.send(
          new BatchGetBuildsCommand({ ids: [list.ids[0]] }),
        );
        const status = latest.builds?.[0]?.buildStatus;
        if (status === "IN_PROGRESS") {
          console.log(`[satellite-rebuild] Build already ${status}, skipping`);
          return;
        }
      }

      const res = await client.send(
        new StartBuildCommand({
          projectName: PROJECT,
          environmentVariablesOverride: [
            {
              name: "BUILD_REASON",
              value: `${reason}${productSlug ? ` (${productSlug})` : ""}`,
              type: "PLAINTEXT",
            },
          ],
        }),
      );

      console.log(
        `[satellite-rebuild] Build started: ${res.build?.id} (reason: ${reason})`,
      );
    } catch (err: any) {
      console.error(`[satellite-rebuild] Failed: ${err.message}`);
    }
  })();
}
