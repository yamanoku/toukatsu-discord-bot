// 必要な型やライブラリをインポート
// Denoの組み込みfetch()を使用します

import { APIEmbed } from "npm:discord.js";
import { initRestClient, sendDiscordNotification } from "./notifyDiscord.ts";
const MESSAGE_TARGET_CHANNEL_ID = Deno.env.get("MESSAGE_TARGET_CHANNEL_ID") ||
  "YOUR_TARGET_CHANNEL_ID"; // 通知先のチャンネルID

// 🔑 環境変数から認証情報を取得
const CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;

const DETAIL_LINK =
  "https://scrapbox.io/toukatsu-dev/%E3%81%BF%E3%82%93%E3%81%AA%E3%81%A7%E9%9F%B3%E6%A5%BD%E3%83%97%E3%83%AC%E3%82%A4%E3%83%AA%E3%82%B9%E3%83%88%E3%82%92%E4%BD%9C%E3%82%8D%E3%81%86%E3%81%AE%E4%BC%9A";

// 🎧 チェック対象のプレイリストID
const PLAYLIST_ID = "78PN9O8cF563eazR5lT4tu"; // 例: Spotifyの公開プレイリストID

// 🛠️ Deno KVのキーを定義
const KV_KEY_SNAPSHOT = ["spotify", PLAYLIST_ID, "snapshot_id"];
const KV_KEY_TRACKS = ["spotify", PLAYLIST_ID, "track_ids"];

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string };
}

interface SpotifyPlaylistItem {
  track: { id: string } | null;
}

interface SpotifyPlaylistMetaData {
  snapshot_id: string;
  tracks: { total: number };
}

interface SpotifyPlaylistTracksData {
  items: SpotifyPlaylistItem[];
}

// ----------------------------------------------------
// 認証処理: Client Credentials Flow (公開プレイリストなので利用可)
// ----------------------------------------------------
async function getAccessToken(): Promise<string> {
  const authHeader = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    // 🚨 失敗時のレスポンスボディを読み込み、詳細なエラーメッセージを取得
    const errorBody = await response.text();

    // SpotifyはJSON形式でエラー詳細を返すことが多い
    let errorMessage =
      `HTTP Status: ${response.status} (${response.statusText})`;
    try {
      const errorJson = JSON.parse(errorBody);
      errorMessage += `\nSpotify Error: ${
        errorJson.error_description || errorJson.error
      }`;
    } catch {
      errorMessage += `\nRaw Body: ${errorBody}`;
    }

    // 失敗原因の詳細を出力してからエラーを投げる
    throw new Error(`Failed to get access token: ${errorMessage}`);
  }

  const data = await response.json() as SpotifyTokenResponse;
  return data.access_token;
}

// ----------------------------------------------------
// Spotify APIからプレイリストの情報を取得
// ----------------------------------------------------
/** プレイリストのメタデータとトラックリストを取得する */
async function fetchPlaylistData(
  accessToken: string,
  playlistId: string,
): Promise<{ snapshotId: string; trackIds: string[] }> {
  // 1. メタデータ (snapshot_id) の取得
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=snapshot_id,tracks.total`,
    {
      headers: { "Authorization": `Bearer ${accessToken}` },
    },
  );
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch playlist meta: ${metaRes.statusText}`);
  }
  const metaData = await metaRes.json() as SpotifyPlaylistMetaData;
  const snapshotId = metaData.snapshot_id;

  // 2. トラックリストの取得 (ページネーションは省略)
  const tracksRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(id))&limit=100`,
    {
      headers: { "Authorization": `Bearer ${accessToken}` },
    },
  );
  if (!tracksRes.ok) {
    throw new Error(`Failed to fetch playlist tracks: ${tracksRes.statusText}`);
  }
  const tracksData = await tracksRes.json() as SpotifyPlaylistTracksData;

  // トラックIDの配列を抽出
  const trackIds = tracksData.items
    .map((item) => item.track?.id)
    .filter((id): id is string => !!id); // IDがないもの（エピソードなど）を除外

  return { snapshotId, trackIds };
}

// ----------------------------------------------------
// メイン処理
// ----------------------------------------------------
export async function notifyNewMusics() {
  const kv = await Deno.openKv();

  console.log("--- Spotify プレイリスト変更チェックを開始 ---");

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
    console.log("✅ アクセストークン取得成功");
  } catch (e) {
    console.error(e);
    return;
  }

  // 1. KVから前回のスナップショットIDを取得
  const snapshotResult = await kv.get<string>(KV_KEY_SNAPSHOT);
  const lastSnapshotId = snapshotResult.value;

  let latestData;
  try {
    // 2. 最新のプレイリスト情報を取得
    latestData = await fetchPlaylistData(accessToken, PLAYLIST_ID);
  } catch (e) {
    console.error("❌ プレイリストデータの取得に失敗:", e);
    return;
  }

  // 3. スナップショットIDを比較して変更をチェック
  // if (latestData.snapshotId === lastSnapshotId) {
  //     console.log("ℹ️ スナップショットIDが一致しました。プレイリストに変更はありません。");
  //     kv.close();
  //     return;
  // }

  console.log(
    `⚠️ プレイリストの変更を検出! (旧ID: ${
      lastSnapshotId || "なし"
    }, 新ID: ${latestData.snapshotId})`,
  );

  // 4. 変更があった場合、KVから前回のトラックIDリストを取得
  const tracksResult = await kv.get<string[]>(KV_KEY_TRACKS);
  const lastTrackIds = new Set(tracksResult.value || []);

  // 5. 差分を計算して、追加された曲を特定
  const addedTrackIds: string[] = [];
  for (const trackId of latestData.trackIds) {
    if (!lastTrackIds.has(trackId)) { // 最大50件まで
      addedTrackIds.push(trackId);
    }
  }

  if (addedTrackIds.length > 0) {
    console.log(`🎉 新しく ${addedTrackIds.length} 曲が追加されました!`);

    // --- 🚀 追加する処理: トラック詳細情報の取得 ---

    // トラックIDをカンマ区切りの文字列に結合
    // Spotify APIの制限で一度に最大50件まで
    const MAX_IDS_PER_REQUEST = 50;
    const limitedAddedTrackIds = addedTrackIds.slice(0, MAX_IDS_PER_REQUEST);
    const idsQuery = limitedAddedTrackIds.join(",");
    const encodedIdsQuery = encodeURIComponent(idsQuery);

    console.log("ℹ️ 追加された曲の詳細情報を取得中...");

    const tracksDetailRes = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${encodedIdsQuery}`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` },
      },
    );

    if (!tracksDetailRes.ok) {
      // 🚨 失敗時のレスポンスボディを読み込み、詳細なエラーメッセージを取得
      const errorBody = await tracksDetailRes.text();

      let errorMessage =
        `HTTP Status: ${tracksDetailRes.status} (${tracksDetailRes.statusText})`;
      try {
        const errorJson = JSON.parse(errorBody);
        // SpotifyのAPIエラーメッセージを具体的に取得
        errorMessage +=
          `\nSpotify Error Detail: ${errorJson.error.message} (Status: ${errorJson.error.status})`;
      } catch {
        errorMessage += `\nRaw Body: ${errorBody}`;
      }

      console.error("❌ トラック詳細情報の取得に失敗:", errorMessage);
      console.error(
        "❌ トラック詳細情報の取得に失敗:",
        tracksDetailRes.statusText,
      );
      // エラー時でもKVの更新は続行することが多いですが、ここでは一旦処理を中断
    } else {
      const tracksDetailData = await tracksDetailRes.json() as {
        tracks: SpotifyTrack[];
      };

      console.log("--- 新しく追加された曲 ---");

      // 2. 整形する (Discord Embedを作成)
      const fields = tracksDetailData.tracks.map(
        (track: SpotifyTrack, index: number) => {
          const trackName = track.name;
          // 複数のアーティストがいる場合があるので、名前をまとめて取得
          const artists = track.artists.map((artist) => artist.name).join(
            " & ",
          );

          console.log(
            `${index + 1}. 曲名: ${trackName} / アーティスト: ${artists}`,
          );

          return {
            name: `🎧️ ${trackName}`,
            value:
              `🎤アーティスト名: ${artists}　💿️アルバム: ${track.album.name}`,
            inline: false,
          };
        },
      ).slice(0, 10); // 最大10件に制限 (Embedの仕様上)
      console.log("-------------------------\n");

      // 0. 自分のサーバーに接続する (RESTクライアントの初期化)
      const rest = initRestClient();

      const notificationEmbed: APIEmbed = {
        title: `📢 「東葛.devのお気に入り」新曲追加通知`,
        description:
          `新曲が${addedTrackIds.length}曲追加されました！ぜひ聞いてみてください。`,
        color: 0x5865F2, // Discordカラー (Blurple)
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: DETAIL_LINK,
        },
      };
      await sendDiscordNotification(
        rest,
        MESSAGE_TARGET_CHANNEL_ID,
        notificationEmbed,
      );
    }
  } else {
    // スナップショットIDは変わったが、追加・削除が相殺されたか、並び替えのみの場合
    console.log(
      "ℹ️ 追加された曲はありませんでした。（並び替えや削除があった可能性があります）",
    );
  }

  // 6. Deno KVの情報を更新 (最新のSnapshot IDとTrack IDリスト)
  const commitResult = await kv.atomic()
    .set(KV_KEY_SNAPSHOT, latestData.snapshotId)
    .set(KV_KEY_TRACKS, latestData.trackIds)
    .commit();

  if (commitResult.ok) {
    console.log("✅ Deno KVに最新のプレイリスト情報を保存しました。");
  } else {
    console.error("❌ Deno KVの更新に失敗しました。");
  }

  kv.close();
  console.log("--- 処理を終了 ---");
}

// Denoの実行コマンドの例:
// deno run --allow-net --allow-env --allow-sys notifyNewMusic.ts
