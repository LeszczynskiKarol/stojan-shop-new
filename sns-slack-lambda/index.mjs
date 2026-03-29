const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
export const handler = async (event) => {
  for (const record of event.Records) {
    const snsMessage = record.Sns;
    const subject = snsMessage.Subject || "AWS Alert";
    const message = snsMessage.Message;
    let slackText;
    try {
      const alarm = JSON.parse(message);
      slackText = [
        `*${alarm.AlarmName}*`,
        `*Status:* ${alarm.OldStateValue} → ${alarm.NewStateValue}`,
        `*Reason:* ${alarm.NewStateReason}`,
        `*Metric:* ${alarm.Trigger?.MetricName || "N/A"}`,
      ].join("\n");
    } catch {
      slackText = `*${subject}*\n${message}`;
    }
    const emoji = slackText.includes("ALARM") ? "🚨" : slackText.includes("OK") ? "✅" : "ℹ️";
    const color = slackText.includes("ALARM") ? "#dc3545" : slackText.includes("OK") ? "#28a745" : "#0088ff";
    const payload = {
      attachments: [{ color, blocks: [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${subject}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: slackText } },
        { type: "context", elements: [{ type: "mrkdwn", text: `SNS → Slack • ${new Date().toISOString()}` }] }
      ]}]
    };
    await fetch(SLACK_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  }
  return { statusCode: 200 };
};
