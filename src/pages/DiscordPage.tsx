import { useState } from "react";
import {
  Bot,
  Copy,
  ArrowUpRight,
  Link2,
  ShieldCheck,
  Terminal,
  Server,
  Check,
  Command,
  MessageSquare,
  Unlink,
  Sparkles,
  ExternalLink,
  Info,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import {
  PageHeader,
  Panel,
  PanelHeading,
  Button,
  Badge,
  Modal,
  Field,
  Loading,
} from "../components/ui";
const commands = [
  {
    cmd: "/zk list",
    desc: "See your deployments, states, and resource allocations.",
    icon: Server,
  },
  {
    cmd: "/zk status",
    desc: "Check CPU, memory, uptime, and connection details.",
    icon: Sparkles,
  },
  {
    cmd: "/zk start · stop · restart",
    desc: "Manage power without leaving your community.",
    icon: Terminal,
  },
  {
    cmd: "/zk backup",
    desc: "Create a snapshot of your deployment workspace.",
    icon: ShieldCheck,
  },
  {
    cmd: "/zk command",
    desc: "Send a server command, with ownership checks.",
    icon: Command,
  },
];
export default function DiscordPage() {
  const { data, refresh, toast } = useStore();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false);
  const configured = data!.integrations.discord;
  const link = async () => {
    setBusy(true);
    try {
      const result = await api<{ code: string }>("/discord/link-code", {
        body: {},
      });
      setCode(result.code);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="YOUR COMMUNITY IS YOUR CONTROL ROOM"
        title="Your panel, in Discord."
        description="Check in, power up, and keep things running. Without changing tabs."
      >
        <Badge tone="purple">
          <Bot size={13} />
          ZK COMPANION
        </Badge>
      </PageHeader>
      <div className="discord-hero">
        <div>
          <span className="discord-eyebrow">
            LESS TAB SWITCHING. MORE COMMUNITY.
          </span>
          <h2>
            Big power.
            <br />
            <span>Small slash command.</span>
          </h2>
          <p>
            Your servers are already part of your community.
            <br />
            Now your control panel is, too.
          </p>
          <div className="discord-command-example">
            <span>/</span>zk start <i>server:</i> Survival SMP <kbd>↵</kbd>
          </div>
        </div>
        <div className="discord-visual">
          <div className="discord-message">
            <span className="bot-avatar">
              <Bot size={28} />
            </span>
            <div>
              <strong>
                ZK Companion <b>APP</b>
              </strong>
              <p>
                <Check size={15} />
                Survival SMP is starting.
              </p>
              <small>Your next adventure is a moment away.</small>
              <div className="discord-message-meta">
                <span className="live-dot" />
                ZK PANEL · just now
              </div>
            </div>
          </div>
          <div className="discord-visual-badge">
            <ShieldCheck size={17} />
            Only your servers. Only your access.
          </div>
        </div>
      </div>
      <div className="discord-layout">
        <div>
          <Panel className="discord-commands">
            <PanelHeading
              title="A few words. A lot of control."
              subtitle="Simple commands, with your panel permissions built in."
            />
            {commands.map((c) => (
              <div className="discord-command-row" key={c.cmd}>
                <span>
                  <c.icon size={19} />
                </span>
                <div>
                  <code>{c.cmd}</code>
                  <p>{c.desc}</p>
                </div>
              </div>
            ))}
          </Panel>
        </div>
        <div>
          <Panel className="discord-connect">
            <span className="discord-connect-icon">
              <Link2 size={26} />
            </span>
            <h2>
              {data!.user.discordId
                ? "You’re connected."
                : "Make the connection."}
            </h2>
            <p>
              {data!.user.discordId
                ? "Your Discord account is linked. Open your community and try /zk list."
                : "Link your account once. Manage only the deployments you own, from any server with the bot."}
            </p>
            {data!.user.discordId ? (
              <>
                <Badge tone="green" dot>
                  ACCOUNT LINKED
                </Badge>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!confirm("Disconnect your Discord account?")) return;
                    await api("/discord/link", { method: "DELETE" });
                    await refresh();
                    toast("Discord account disconnected.");
                  }}
                >
                  <Unlink size={15} />
                  Disconnect account
                </Button>
              </>
            ) : (
              <Button
                loading={busy}
                onClick={configured ? link : () => setSetup(true)}
              >
                <Link2 size={16} />
                {configured ? "Get a linking code" : "Set up the companion"}
                <ArrowUpRight size={15} />
              </Button>
            )}
            <div className="discord-connect-note">
              <ShieldCheck size={15} />
              <span>
                No administrator permissions needed.
                <br />
                One-time codes expire in 10 minutes.
              </span>
            </div>
          </Panel>
          <Panel className="discord-setup-card">
            <h3>Hosting your own companion?</h3>
            <p>
              One bot. Your entire hosting community. Set it up with your own
              Discord application.
            </p>
            <button className="text-link" onClick={() => setSetup(true)}>
              Read setup guide <ArrowUpRight size={14} />
            </button>
          </Panel>
        </div>
      </div>
      {code && (
        <Modal
          title="One code. You're connected."
          description="In your Discord server, use the command below. Send it in a private channel or a place only you can see."
          onClose={() => setCode("")}
        >
          <div className="link-command">
            <code>/zk link code:{code}</code>
            <button
              className="icon-button"
              aria-label="Copy Discord link command"
              onClick={() =>
                navigator.clipboard
                  .writeText("/zk link code:" + code)
                  .then(() => toast("Command copied."))
                  .catch(() =>
                    toast("Select the command and copy it manually.", "info"),
                  )
              }
            >
              <Copy size={18} />
            </button>
          </div>
          <div className="inline-note">
            <ShieldCheck size={17} />
            This code expires in 10 minutes and can only be used once. Never
            share it with someone else.
          </div>
          <Button
            className="full-width"
            variant="secondary"
            onClick={async () => {
              await refresh();
              setCode("");
            }}
          >
            I've linked my account <Check size={15} />
          </Button>
        </Modal>
      )}
      {setup && (
        <Modal
          title="Meet your new companion"
          description="Run the included Discord bot with your own application credentials."
          onClose={() => setSetup(false)}
          wide
        >
          <ol className="discord-setup-steps">
            <li>
              <strong>Create a Discord application</strong>
              <p>
                In the Discord Developer Portal, create an application and add a
                bot. Keep the bot token private.
              </p>
            </li>
            <li>
              <strong>Invite it to your community</strong>
              <p>
                Use the <code>bot</code> and <code>applications.commands</code>{" "}
                scopes. The bot needs View Channels, Send Messages, and Embed
                Links — not Administrator.
              </p>
            </li>
            <li>
              <strong>Configure your panel environment</strong>
              <pre>
                DISCORD_BOT_TOKEN=your_private_bot_token{"\n"}
                DISCORD_APPLICATION_ID=your_application_id{"\n"}
                DISCORD_GUILD_ID=your_test_guild_id_optional
              </pre>
            </li>
            <li>
              <strong>Register commands and start the bot</strong>
              <pre>npm run bot:register{"\n"}npm run bot</pre>
              <p>
                Run these from the same deployment and data directory as the
                panel. Never put bot tokens in frontend code.
              </p>
            </li>
            <li>
              <strong>Link your account</strong>
              <p>
                Return here, choose “Get a linking code,” then use{" "}
                <code>/zk link</code> in Discord. Try <code>/zk list</code> to
                see your deployments.
              </p>
            </li>
          </ol>
          <a
            className="btn btn-secondary full-width"
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noreferrer"
          >
            Open Discord Developer Portal <ExternalLink size={15} />
          </a>
        </Modal>
      )}
    </div>
  );
}
