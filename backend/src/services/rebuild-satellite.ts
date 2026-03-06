/**
 * backend/src/services/rebuild-satellite.ts
 *
 * Triggeruje przebudowę stron zapleczowych:
 * - silnik-elektryczny.pl (CodeBuild: silnik-elektryczny-pl)
 * - silniki-trojfazowe.pl (CodeBuild: silniki-trojfazowe-pl)
 *
 * Wywołuje CodeBuild bezpośrednio przez AWS SDK
 * EC2 musi mieć IAM role z uprawnieniem codebuild:StartBuild
 */

const PROJECTS = ["silnik-elektryczny-pl", "silniki-trojfazowe-pl"];

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

  // Fire and forget — triggeruj oba projekty
  (async () => {
    try {
      const {
        CodeBuildClient,
        StartBuildCommand,
        ListBuildsForProjectCommand,
        BatchGetBuildsCommand,
      } = await import("@aws-sdk/client-codebuild");
      const client = new CodeBuildClient({ region: "eu-north-1" });

      for (const project of PROJECTS) {
        try {
          // Debounce per-project: sprawdź czy build nie trwa
          const list = await client.send(
            new ListBuildsForProjectCommand({
              projectName: project,
              sortOrder: "DESCENDING",
            }),
          );
          if (list.ids?.length) {
            const latest = await client.send(
              new BatchGetBuildsCommand({ ids: [list.ids[0]] }),
            );
            const status = latest.builds?.[0]?.buildStatus;
            if (status === "IN_PROGRESS") {
              console.log(
                `[satellite-rebuild] ${project}: build already IN_PROGRESS, skipping`,
              );
              continue;
            }
          }

          const res = await client.send(
            new StartBuildCommand({
              projectName: project,
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
            `[satellite-rebuild] ${project}: build started ${res.build?.id} (${reason})`,
          );
        } catch (err: any) {
          console.error(
            `[satellite-rebuild] ${project}: failed: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      console.error(`[satellite-rebuild] SDK import failed: ${err.message}`);
    }
  })();
}
