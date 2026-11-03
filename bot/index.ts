import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { linkAccount, execute, choices } from "./core.js";
import { config } from "../server/config.js";
import { stopAutopilot } from "../server/autopilot.js";
const token = process.env.DISCORD_BOT_TOKEN;
if (!token)
  throw new Error("DISCORD_BOT_TOKEN is required. See docs/DISCORD.md.");
// The panel owns the scheduler. A standalone bot must not run competing recovery tasks.
stopAutopilot();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, (c) =>
  console.log(
    `ZK Companion connected as ${c.user.tag}. Account ownership enforced on every command.`,
  ),
);
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === "zk") {
      await interaction.respond(choices(interaction.user.id));
      return;
    }
    if (!interaction.isChatInputCommand() || interaction.commandName !== "zk")
      return;
    const action = interaction.options.getSubcommand();
    // Linking is private. Other replies are also ephemeral to avoid leaking IDs or console output.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (action === "link") {
      const name = linkAccount(
        interaction.user.id,
        interaction.options.getString("code", true),
      );
      await interaction.editReply({
        content: `You're connected. Welcome, **${name.replace(/[*\n[\]]/g, "")}**. Try /zk list to see your workspace.`,
      });
      return;
    }
    const text = await execute(
      interaction.user.id,
      action,
      interaction.options.getString("server") || undefined,
      interaction.options.getString("command") || undefined,
    );
    const embed = new EmbedBuilder()
      .setColor(config.mode === "demo" ? 0xdfbf7b : 0xbcf36b)
      .setAuthor({ name: "ZK PANEL · Your workspace, in control." })
      .setDescription(text)
      .setFooter({
        text:
          config.mode === "demo"
            ? "Interactive demo · no real compute or payments"
            : "Only your deployments. Only your access.",
      })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The request could not be completed.";
    console.error("Discord command failed:", message);
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied)
          await interaction.editReply({
            content: message.slice(0, 1800),
            embeds: [],
            components: [],
          });
        else
          await interaction.reply({
            content: message.slice(0, 1800),
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch {}
  }
});
client.on(Events.Error, (e) =>
  console.error("Discord client error:", e.message),
);
await client.login(token);
const shutdown = async () => {
  await client.destroy();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
