import { notifyActiveForumPosts } from "./notifyForumPosts.ts";
import { notifyNewMusics } from "./notifyNewMusic.ts";

/**
 * 4. Deno Cronの設定 (毎朝9時00分 JST, 月・木曜日)
 */
Deno.cron(
    "Active Forum Posts Daily Notification",
    "0 0 * * 1,4",
    async () => {
        console.log("--- Deno Cron 実行開始 (JST 9:00) ---");
        await notifyActiveForumPosts();
        console.log("--- Deno Cron 実行終了 ---");
    }
);


Deno.cron(
    "Spotify Add New Music Notification",
    "0 1 * * *",
    async () => {
        console.log("--- Deno Cron 実行開始 (JST 9:00) ---");
        await notifyNewMusics();
        console.log("--- Deno Cron 実行終了 ---");
    }
);