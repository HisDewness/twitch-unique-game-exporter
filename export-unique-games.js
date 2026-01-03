require("dotenv").config();

// export-unique-games.js
// Node 18+

const fs = require("fs");

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const LOGIN = "cherrius_";

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET");
}

const headers = token => ({
  "Client-ID": CLIENT_ID,
  "Authorization": `Bearer ${token}`
});

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token` +
      `?client_id=${CLIENT_ID}` +
      `&client_secret=${CLIENT_SECRET}` +
      `&grant_type=client_credentials`,
    { method: "POST" }
  );
  return (await res.json()).access_token;
}

async function getUserId(token) {
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${LOGIN}`,
    { headers: headers(token) }
  );
  const json = await res.json();
  return json.data[0].id;
}

async function getAllVods(token, userId) {
  let vods = [];
  let cursor = null;

  do {
    const url = new URL("https://api.twitch.tv/helix/videos");
    url.searchParams.set("user_id", userId);
    url.searchParams.set("first", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url, { headers: headers(token) });
    const json = await res.json();

    vods.push(...json.data);
    cursor = json.pagination?.cursor;
  } while (cursor);

  return vods;
}

async function getVodSegments(token, vodId) {
  const res = await fetch(
    `https://api.twitch.tv/helix/videos?type=archive&id=${vodId}`,
    { headers: headers(token) }
  );
  const json = await res.json();
  return json.data;
}

(async () => {
  const token = await getToken();
  const userId = await getUserId(token);
  const vods = await getAllVods(token, userId);

  const games = new Map();

  for (const vod of vods) {
    if (!vod.game_id) continue;

    if (!games.has(vod.game_id)) {
      games.set(vod.game_id, {
        game_id: vod.game_id,
        game_name: vod.game_name,
        first_seen_at: vod.created_at,
        last_seen_at: vod.created_at,
        vod_count: 1
      });
    } else {
      const g = games.get(vod.game_id);
      g.vod_count += 1;
      if (vod.created_at < g.first_seen_at) g.first_seen_at = vod.created_at;
      if (vod.created_at > g.last_seen_at) g.last_seen_at = vod.created_at;
    }
  }

  const csv = [
    "game_id,game_name,first_seen_at,last_seen_at,vod_count",
    ...[...games.values()].map(g =>
      `${g.game_id},"${g.game_name}",${g.first_seen_at},${g.last_seen_at},${g.vod_count}`
    )
  ].join("\n");

  fs.writeFileSync("unique_games.csv", csv);
  console.log(`Exported ${games.size} unique games`);
})();
