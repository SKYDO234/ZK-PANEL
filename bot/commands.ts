import { SlashCommandBuilder } from "discord.js";
// Explicit builders keep Discord's command schema clear and version-stable.
export const commandData = new SlashCommandBuilder()
  .setName("zk")
  .setDescription("Your ZK PANEL workspace, right here in Discord.")
  .addSubcommand((s) =>
    s
      .setName("link")
      .setDescription("Link your panel account with a one-time code.")
      .addStringOption((o) =>
        o
          .setName("code")
          .setDescription("Code from ZK PANEL → Discord bot")
          .setRequired(true)
          .setMinLength(12)
          .setMaxLength(12),
      ),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("List your deployments."),
  );
for (const [name, description] of [
  ["status", "Check a deployment’s live state and resources."],
  ["start", "Start your deployment."],
  ["stop", "Gracefully stop your deployment."],
  ["restart", "Restart your deployment."],
  ["backup", "Create a verified workspace backup."],
])
  commandData.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(description)
      .addStringOption((o) =>
        o
          .setName("server")
          .setDescription("Choose your deployment")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );
commandData.addSubcommand((s) =>
  s
    .setName("command")
    .setDescription("Send a command to your deployment.")
    .addStringOption((o) =>
      o
        .setName("server")
        .setDescription("Choose your deployment")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((o) =>
      o
        .setName("command")
        .setDescription("Server command, for example: list")
        .setRequired(true)
        .setMaxLength(2000),
    ),
);
