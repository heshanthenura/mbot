import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { createKazagumo } from "./lavalink/manager";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const kazagumo = createKazagumo(client);
const autocompleteCache = new Map<
  string,
  Array<{ name: string; value: string }>
>();
const AUTOCOMPLETE_TIMEOUT_MS = 1200;

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

kazagumo.on("playerEmpty", (player) => {
  if (!player.textId) return;

  const channel = client.channels.cache.get(player.textId);

  if (!channel?.isSendable()) return;

  channel.send("Queue ended. Leaving voice channel.");

  setTimeout(() => {
    const current = kazagumo.players.get(player.guildId);

    if (!current || current.queue.size === 0) {
      player.destroy();
    }
  }, 10_000);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "play") return;

    const focused = interaction.options.getFocused();

    if (typeof focused !== "string" || focused.length === 0) {
      return interaction.respond([]);
    }

    const cachedChoices = autocompleteCache.get(focused);
    if (cachedChoices) {
      return interaction.respond(cachedChoices);
    }

    try {
      const result = await Promise.race([
        kazagumo.search(focused, {
          requester: interaction.user,
        }),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), AUTOCOMPLETE_TIMEOUT_MS);
        }),
      ]);

      if (!result) {
        return interaction.respond([]);
      }

      const choices = result.tracks.slice(0, 25).map((t) => ({
        name: `${t.title} — ${t.author}`.slice(0, 100),
        value: (t.uri ?? t.title).slice(0, 100),
      }));

      autocompleteCache.set(focused, choices);

      if (autocompleteCache.size > 50) {
        const firstKey = autocompleteCache.keys().next().value;
        if (firstKey) {
          autocompleteCache.delete(firstKey);
        }
      }

      return interaction.respond(choices);
    } catch (error) {
      console.error("Autocomplete search failed:", error);
      return interaction.respond([]).catch(() => null);
    }
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("query", true);

    const member = interaction.member;

    if (!member || !("voice" in member) || !member.voice.channel) {
      return interaction.reply({
        content: "You must join a voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = member.voice.channel;

    await interaction.reply(`Searching for: ${query}`);

    const player = await kazagumo.createPlayer({
      guildId: interaction.guildId!,
      voiceId: voiceChannel.id,
      textId: interaction.channelId,
      volume: 100,
    });

    const result = await kazagumo.search(query, {
      requester: interaction.user,
    });

    if (!result.tracks.length) {
      return interaction.editReply("No results found");
    }

    const track = result.tracks[0];

    player.queue.add(track);

    if (!player.playing && !player.paused) {
      player.play();
    }

    await interaction.editReply(`Now playing: ${track.title}`);
  }

  if (interaction.commandName === "clear") {
    const player = kazagumo.players.get(interaction.guildId!);

    if (!player) {
      return interaction.reply({
        content: "No music is currently playing.",
        flags: MessageFlags.Ephemeral,
      });
    }

    player.destroy();

    await interaction.reply("Playback stopped and queue cleared.");
  }
});

client.login(process.env.BOT_TOKEN);
