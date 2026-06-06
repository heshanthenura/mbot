import { Kazagumo } from "kazagumo";
import { Connectors } from "shoukaku";

const nodes = [
  {
    name: "main",
    url: "lavalink:2333",
    auth: "youshallnotpass",
    secure: false,
  },
];

export function createKazagumo(client: any) {
  return new Kazagumo(
    {
      defaultSearchEngine: "youtube",

      send: (guildId: string, payload: any) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
    },
    new Connectors.DiscordJS(client),
    nodes,
  );
}
