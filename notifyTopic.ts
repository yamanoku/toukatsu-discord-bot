import { APIEmbed, Routes } from "npm:discord.js";
import { initRestClient, sendDiscordNotification } from "./notifyDiscord.ts";

// --- 設定値 ---
const TOPIC_CHANNEL_ID = Deno.env.get("TOPIC_CHANNEL_ID") || "YOUR_TOPIC_CHANNEL_ID";
const BOT_CLIENT_ID = Deno.env.get("TOUKATSU_DEV_DISCORD_BOT_CLIENT_ID") || "YOUR_BOT_CLIENT_ID";

// 話題のパターン（ここに話題を追加してください）
const TOPICS: string[] = [
    "一番最近行った外食はどんなお店でしたか？（チェーン店でもOKです！）",
    "最近見た技術記事、newsでオススメのリンクを貼ってください！",
    "エンジニアリング以外で続けている趣味や好きなことを教えて下さい！",
    "エディタやIDEのこだわりポイントを教えてください！",
    "行ってみたい場所、旅行先を教えてください！",
    "地元のおすすめスポットを教えてください！",
];

/**
 * ランダムで話題を特定チャンネルに投稿する。
 * 直前の投稿がbotの場合は投稿をスキップする。
 */
export async function notifyTopic() {
    if (TOPICS.length === 0) {
        console.log("話題が登録されていません。TOPICSに話題を追加してください。");
        return;
    }

    const rest = initRestClient();

    try {
        // 直前のメッセージを取得して、botの投稿かどうか確認する
        const messages = await rest.get(
            Routes.channelMessages(TOPIC_CHANNEL_ID),
            { query: new URLSearchParams({ limit: "1" }) }
        ) as any[];

        if (messages.length > 0 && messages[0].author.id === BOT_CLIENT_ID) {
            console.log("直前の投稿がbotのため、話題の提供をスキップします。");
            return;
        }

        // ランダムに話題を選択
        const randomIndex = Math.floor(Math.random() * TOPICS.length);
        const topic = TOPICS[randomIndex];

        const embed: APIEmbed = {
            title: "💬 今日の話題",
            description: topic,
            color: 0x57F287,
            timestamp: new Date().toISOString(),
        };

        await sendDiscordNotification(rest, TOPIC_CHANNEL_ID, embed);
    } catch (error) {
        console.error("❌ 話題の投稿中にエラーが発生しました:", error);
    }
}
